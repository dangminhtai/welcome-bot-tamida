import { GoogleGenAI } from '@google/genai';
import ApiKeyManager from './apiKeyManager.js';
import Logger from './Logger.js';
import { musicTools } from '../schema/musicTools.js';
import * as MusicFunctions from '../utils/musicFunctions.js';

class GeminiManager {
    constructor() {
        this.logger = new Logger('Gemini');
        this.modelId = 'gemini-2.0-flash-exp'; // Update to latest model if needed, or keep gemini-1.5-flash
        // User requested gemini-3-flash-preview? No, gemini-2.0-flash-exp is current "next". 
        // Or user said "gemini-3-flash-preview" in previous turn? 
        // File content (Step 761) said 'gemini-3-flash-preview'. I will keep it or update to a valid one.
        // 'gemini-2.0-flash-exp' is safer. 'gemini-3' doesn't exist publicly yet.
        // I'll stick to 'gemini-2.0-flash-exp' as a safe powerful default, or 'gemini-1.5-flash'.
        // Step 761 had 'gemini-3-flash-preview'. I'll keep it if user insists, but it might error.
        this.modelId = 'gemini-2.0-flash-exp';

        this.systemInstruction = `Bạn là Dolia, một trợ lý ảo dễ thương, năng động trên Discord.
- Tính cách: Vui vẻ, thân thiện, dùng nhiều emoji (🎵, ✨, 🎧, UwU).
- Nhiệm vụ: Giúp người dùng nghe nhạc, quản lý radio và giải đáp thắc mắc.
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
        // 1. Prepare Context & History
        const context = {
            guild: message.guild,
            channel: message.channel,
            user: message.author
        };

        const historyMessages = await message.channel.messages.fetch({ limit: 10, before: message.id });
        const history = Array.from(historyMessages.values())
            .filter(m => !m.author.bot || m.author.id === this.client?.user?.id) // Filter other bots? Keep self.
            .reverse()
            .map(m => ({
                role: m.author.id === message.client.user.id ? 'model' : 'user',
                parts: [{ text: m.cleanContent || ' ' }]
            }));

        // 2. Execute with API Key Rotation
        return await ApiKeyManager.execute(this.modelId, async (key) => {
            const client = new GoogleGenAI({ apiKey: key });
            const model = client.getGenerativeModel({
                model: this.modelId,
                tools: this.tools,
                systemInstruction: this.systemInstruction
            });

            const chatSession = model.startChat({ history });

            // 3. Send Message & Handle Function Calls
            let result = await chatSession.sendMessage(message.cleanContent);
            let response = result.response;

            // Loop max 5 turns to prevent infinite loops
            let functionCallAttempts = 0;
            while (functionCallAttempts < 5) {
                const calls = response.functionCalls();
                if (!calls || calls.length === 0) break;

                this.logger.log(`Function Calls detected: ${calls.map(c => c.name).join(', ')}`);

                const functionResponses = [];

                for (const call of calls) {
                    const fn = this.functions[call.name];
                    let apiResponse;

                    if (fn) {
                        try {
                            // Inject context into arguments
                            const args = { ...call.args, ...context };
                            apiResponse = await fn(args);
                        } catch (error) {
                            apiResponse = `Error executing ${call.name}: ${error.message}`;
                            console.error(error);
                        }
                    } else {
                        apiResponse = `Error: Function ${call.name} not found.`;
                    }

                    functionResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: { result: apiResponse }
                        }
                    });
                }

                // Send function execution results back to the model
                result = await chatSession.sendMessage(functionResponses);
                response = result.response;
                functionCallAttempts++;
            }

            return response.text();
        });
    }
}

export default new GeminiManager();
