import { GoogleGenAI } from '@google/genai';
import ApiKeyManager from './apiKeyManager.js';
import Logger from './Logger.js';
import { musicTools } from '../schema/musicTools.js';
import * as MusicFunctions from '../utils/musicFunctions.js';
import * as ChatHelper from '../helpers/chatHelper.js';

class GeminiManager {
    constructor() {
        this.logger = new Logger('Gemini');
        this.modelId = 'gemini-3-flash-preview';

        this.systemInstruction = `Bạn là Dolia, một trợ lý ảo dễ thương, năng động trên Discord.
- Tính cách: Vui vẻ, thân thiện, dùng nhiều emoji (🎵, ✨, 🎧, UwU).
- Nhiệm vụ: Giúp người dùng nghe nhạc, quản lý radio và giải đáp thắc mắc.
- Ghi nhớ user: Bạn có khả năng nhớ tên và sở thích của user từ lịch sử chat.
- Nguyên tắc:
  1. Trả lời ngắn gọn, đi vào trọng tâm.
  2. Nếu người dùng muốn nghe nhạc -> gọi tool 'play_music'.
  3. Nếu muốn mở bảng điều khiển -> gọi tool 'show_music_panel'.
  4. Luôn kiểm tra tool phù hợp trước khi trả lời.`;

        // Tool Definitions
        this.tools = [{ functionDeclarations: musicTools }];

        // Function Map
        this.functions = {
            'play_music': MusicFunctions.play_music,
            'control_playback': MusicFunctions.control_playback,
            'adjust_audio_settings': MusicFunctions.adjust_audio_settings,
            'manage_radio': MusicFunctions.manage_radio,
            'show_music_panel': MusicFunctions.show_music_panel
        };
    }

    async chat(message) {
        // 1. Prepare Context
        const context = {
            guild: message.guild,
            channel: message.channel,
            user: message.author
        };

        const userId = message.author.id;
        const channelId = message.channel.id;

        // 2. Fetch DB History
        // Get or Create Session
        const chatSession = await ChatHelper.getChatSession(userId, channelId);
        // Get formatted history for Gemini API
        const contents = await ChatHelper.getHistory(userId, chatSession);

        // Add User Message to History
        const userTurn = {
            role: 'user',
            parts: [{ text: message.cleanContent }]
        };
        contents.push(userTurn);

        // Track new turns to save later
        const newTurns = [userTurn];

        // 3. Execute with API Key Rotation
        return await ApiKeyManager.execute(this.modelId, async (key) => {
            const ai = new GoogleGenAI({ apiKey: key });

            // Loop max 5 turns for function calling
            let functionCallAttempts = 0;
            let finalResponseText = null;

            while (functionCallAttempts < 5) {
                // Generate Content
                const response = await ai.models.generateContent({
                    model: this.modelId,
                    contents: contents,
                    config: {
                        tools: this.tools,
                        systemInstruction: this.systemInstruction,
                        temperature: 1.5,
                        topK: 40,
                        topP: 0.95
                    }
                });

                // Check for Function Calls (Property access per docs)
                if (response.functionCalls && response.functionCalls.length > 0) {
                    this.logger.log(`Function Calls detected: ${response.functionCalls.map(c => c.name).join(', ')}`);

                    // 1. Add Model's Function Call to Context
                    const functionCallParts = response.functionCalls.map(call => ({
                        functionCall: {
                            name: call.name,
                            args: call.args
                        }
                    }));

                    const modelCallTurn = {
                        role: 'model',
                        parts: functionCallParts
                    };
                    contents.push(modelCallTurn);
                    newTurns.push(modelCallTurn);

                    // 2. Execute Functions & Build Responses
                    const functionResponseParts = [];
                    for (const call of response.functionCalls) {
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
                                response: apiResponse
                            }
                        });
                    }

                    // 3. Add Function Responses to Context
                    const functionResponseTurn = {
                        role: 'user',
                        parts: functionResponseParts
                    };
                    contents.push(functionResponseTurn);
                    newTurns.push(functionResponseTurn);

                } else {
                    // No function calls, just text
                    finalResponseText = response.text;
                    // Add Final Model Response to New Turns
                    newTurns.push({
                        role: 'model',
                        parts: [{ text: finalResponseText }]
                    });

                    break;
                }

                functionCallAttempts++;
            }

            // 4. Save Interaction to DB
            if (newTurns.length > 0) {
                await ChatHelper.saveInteraction(chatSession, newTurns);
            }

            return finalResponseText;
        });
    }
}

export default new GeminiManager();
