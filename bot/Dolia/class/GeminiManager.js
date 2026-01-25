import { GoogleGenAI } from '@google/genai';
import ApiKeyManager from './apiKeyManager.js';
import Logger from './Logger.js';
import { musicTools } from '../schema/musicTools.js';
import * as MusicFunctions from '../utils/musicFunctions.js';
import * as ChatHelper from '../helpers/chatHelper.js';

class GeminiManager {
    constructor() {
        this.logger = {
            info: (msg) => Logger.info(`[Gemini] ${msg}`),
            warn: (msg) => Logger.warn(`[Gemini] ${msg}`),
            error: (msg) => Logger.error(`[Gemini] ${msg}`),
            log: (msg) => Logger.info(`[Gemini] ${msg}`)
        };
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

        return await ApiKeyManager.execute(this.modelId, async (key) => {
            // FIX: Luôn khởi tạo instance mới để đảm bảo key mới nhất
            const ai = new GoogleGenAI({ apiKey: key });

            let functionCallAttempts = 0;
            let finalResponseText = null;

            while (functionCallAttempts < 5) {
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

                // FIX: response.text là Getter, không phải Function.
                // Nếu gọi response.text() sẽ crash.
                // Kiểm tra an toàn để tránh null/undefined
                const candidate = response.candidates?.[0];
                const content = candidate?.content;
                const responseParts = content?.parts || [];

                // Kiểm tra function call bằng cách duyệt parts (an toàn nhất)
                const hasFunctionCall = responseParts.some(p => p.functionCall);

                if (hasFunctionCall) {
                    const callNames = responseParts
                        .filter(p => p.functionCall)
                        .map(p => p.functionCall.name)
                        .join(', ');

                    this.logger.info(`Function Calls detected: ${callNames}`);

                    // 1. Add Model Turn (Giữ nguyên cấu trúc trả về từ Google để bảo toàn context)
                    const modelCallTurn = {
                        role: 'model',
                        parts: responseParts
                    };
                    contents.push(modelCallTurn);
                    newTurns.push(modelCallTurn);

                    // 2. Execute & Build Response
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

                            // FIX CRITICAL: Phải trả về 'id' của functionCall nếu có.
                            // Nếu thiếu id, Google sẽ báo lỗi hoặc hallucinate.
                            functionResponseParts.push({
                                functionResponse: {
                                    name: call.name,
                                    response: apiResponse,
                                    id: call.id // <--- QUAN TRỌNG
                                }
                            });
                        }
                    }

                    // 3. Add User (Function Response) Turn
                    const functionResponseTurn = {
                        role: 'user',
                        parts: functionResponseParts
                    };
                    contents.push(functionResponseTurn);
                    newTurns.push(functionResponseTurn);

                } else {
                    // FIX: Lấy text an toàn qua getter .text (không có ngoặc tròn)
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
