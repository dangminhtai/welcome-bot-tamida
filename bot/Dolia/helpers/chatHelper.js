import keyManager from '../class/apiKeyManager.js';
import { Gemini } from '../class/gemini.js';

export async function getChatSession(userId, channelId) {
    let chatSession = await Chat.findOne({ userId, channelId });
    if (!chatSession) {
        chatSession = new Chat({ userId, channelId, turns: [] });
    }
    return chatSession;
}

export async function getHistory(userId, chatSession) {
    const user = await User.findOne({ userId });
    const limit = user.chatLimit || 20;

    return JSON.parse(JSON.stringify(chatSession.turns.slice(-limit).flatMap(turn => [
        {
            role: "user",
            parts: turn.user.parts.map(p => ({ text: p.text }))
        },
        {
            role: "model",
            parts: turn.model.parts.map(p => ({ text: p.text }))
        }
    ])));
}


export async function genRes(userId, userContent, history, systemPrompt, generationConfig = {}) {
    const userPref = await User.findOne({ userId });
    const preferredModel = userPref?.selectedModel || 'dynamic';
    // Thay thế placeholder trong sysPrompt hoặc nối đuôi nếu không tìm thấy
    let finalSystemPrompt = systemPrompt;
    // console.log(finalSystemPrompt);
    let modelsToTry = MODEL_PRIORITY;
    if (preferredModel !== 'dynamic') {
        modelsToTry = [preferredModel];
    }

    let lastError = null;

    for (const modelId of modelsToTry) {
        try {
            const result = await keyManager.execute(modelId, async (apiKey) => {
                const gemini = new Gemini(apiKey, finalSystemPrompt, modelId);
                const chat = gemini.createChat(history, generationConfig);
                const text = await gemini.sendMessage(chat, userContent);
                return { responseText: text, usedKey: apiKey, modelId: gemini.modelId };
            });

            if (result) return result;

        } catch (error) {
            lastError = error;
            console.warn(`⚠️ Model ${modelId} skipped: ${error.message}`);
        }
    }

    throw lastError || new Error("All models failed.");
}

export async function saveInteraction(chatSession, userContent, responseText, modelId, usedKey) {
    chatSession.turns.push({
        user: { parts: [{ text: userContent }] },
        model: { parts: [{ text: responseText }] }
    });
    await chatSession.save();

    if (usedKey) {
        const keySuffix = usedKey.slice(-4);
        try {
            await RateLimit.findOneAndUpdate(
                { model: modelId, apiKey: keySuffix },
                { $inc: { rpm: 1, rpd: 1 } },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error("RateLimit update error:", err);
        }
    }
}
