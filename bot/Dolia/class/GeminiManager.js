import { GoogleGenAI } from '@google/genai';
import ApiKeyManager from './apiKeyManager.js';
import Logger from './Logger.js';
import { musicTools } from '../schema/musicTools.js';
import * as MusicFunctions from '../utils/musicFunctions.js';
import * as ChatHelper from '../helpers/chatHelper.js';
import { loadSystemPrompt } from '../helpers/promptHelper.js';

class GeminiManager {
    constructor() {
        this.logger = {
            info: (msg) => Logger.info(`[Gemini] ${msg}`),
            warn: (msg) => Logger.warn(`[Gemini] ${msg}`),
            error: (msg) => Logger.error(`[Gemini] ${msg}`),
            log: (msg) => Logger.info(`[Gemini] ${msg}`)
        };
        this.modelId = 'gemini-3-flash-preview';

        this.tools = [{ functionDeclarations: musicTools }];

        this.functions = {
            'play_music': MusicFunctions.play_music,
            'control_playback': MusicFunctions.control_playback,
            'adjust_audio_settings': MusicFunctions.adjust_audio_settings,
            'manage_radio': MusicFunctions.manage_radio,
            'show_music_panel': MusicFunctions.show_music_panel
        };
    }

    async chat(message) {
        const context = {
            guild: message.guild,
            channel: message.channel,
            user: message.author
        };

        const userId = message.author.id;
        const channelId = message.channel.id;

        const chatSession = await ChatHelper.getChatSession(userId, channelId);
        const contents = await ChatHelper.getHistory(userId, chatSession);

        const userTurn = {
            role: 'user',
            parts: [{ text: message.cleanContent }]
        };
        contents.push(userTurn);
        const newTurns = [userTurn];

        // Prepare replacements
        const replacements = {
            '{{user}}': message.member?.displayName || message.author.globalName || message.author.username || 'User',
            '{{user_name}}': message.member?.displayName || message.author.username || 'User',
            '{{user_id}}': userId,
            '{{server_name}}': message.guild?.name || 'Direct Message (DM)',
            '{{guild_name}}': message.guild?.name || 'DM',
            '{{channel_name}}': message.channel.name || 'Private Chat',
            '{{time}}': new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            '{{current_time}}': new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            '{{bot_name}}': message.client.user.username || 'Dolia'
        };
        const systemInstruction = loadSystemPrompt(replacements);

        return await ApiKeyManager.execute(this.modelId, async (key) => {
            const ai = new GoogleGenAI({ apiKey: key });

            let functionCallAttempts = 0;
            let finalResponseText = null;

            while (functionCallAttempts < 5) {
                const response = await ai.models.generateContent({
                    model: this.modelId,
                    contents: contents,
                    config: {
                        tools: this.tools,
                        systemInstruction: systemInstruction,
                        temperature: 1.5,
                        topK: 40,
                        topP: 0.95
                    }
                });

                const candidate = response.candidates?.[0];
                const content = candidate?.content;
                const responseParts = content?.parts || [];

                const hasFunctionCall = responseParts.some(p => p.functionCall);

                if (hasFunctionCall) {
                    const callNames = responseParts
                        .filter(p => p.functionCall)
                        .map(p => p.functionCall.name)
                        .join(', ');

                    this.logger.info(`Function Calls detected: ${callNames}`);

                    const modelCallTurn = {
                        role: 'model',
                        parts: responseParts
                    };
                    contents.push(modelCallTurn);
                    newTurns.push(modelCallTurn);

                    const functionResponseParts = [];

                    for (const part of responseParts) {
                        if (part.functionCall) {
                            const call = part.functionCall;
                            const fn = this.functions[call.name];
                            let apiResponse;

                            if (fn) {
                                try {
                                    const args = { ...call.args, ...context };
                                    const result = await fn(args);
                                    apiResponse = { result: result };
                                } catch (error) {
                                    apiResponse = { error: error.message };
                                    console.error(`Error executing ${call.name}:`, error);
                                }
                            } else {
                                apiResponse = { error: `Function ${call.name} not found` };
                            }

                            functionResponseParts.push({
                                functionResponse: {
                                    name: call.name,
                                    response: apiResponse,
                                    id: call.id
                                }
                            });
                        }
                    }

                    const functionResponseTurn = {
                        role: 'user',
                        parts: functionResponseParts
                    };
                    contents.push(functionResponseTurn);
                    newTurns.push(functionResponseTurn);

                } else {
                    finalResponseText = response.text || responseParts.find(p => p.text)?.text || "";

                    newTurns.push({
                        role: 'model',
                        parts: [{ text: finalResponseText }]
                    });

                    break;
                }

                functionCallAttempts++;
            }

            if (newTurns.length > 0) {
                await ChatHelper.saveInteraction(chatSession, newTurns);
            }

            return finalResponseText;
        });
    }
}

export default new GeminiManager();
