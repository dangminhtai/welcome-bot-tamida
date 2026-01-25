import Chat from '../models/Chat.js';
import User from '../models/User.js';

export async function getChatSession(userId, channelId) {
    let chatSession = await Chat.findOne({ userId, channelId });
    if (!chatSession) {
        chatSession = new Chat({ userId, channelId, turns: [] });
    }
    return chatSession;
}

export async function getHistory(userId, chatSession) {
    const user = await User.findOne({ userId });
    const limit = user?.chatLimit || 20;

    // Slice last N turns
    const relevantTurns = chatSession.turns.slice(-limit);

    // Map DB schema to Gemini API Content format
    return relevantTurns.map(turn => {
        const parts = turn.parts.map(p => {
            const part = {};
            if (p.text) part.text = p.text;
            if (p.functionCall) part.functionCall = p.functionCall;
            if (p.functionResponse) part.functionResponse = p.functionResponse;
            return part;
        });

        return {
            role: turn.role,
            parts: parts
        };
    });
}

export async function saveInteraction(chatSession, newContents) {
    // newContents: Array of { role, parts }
    // We append them to the session turns
    for (const content of newContents) {
        // Map Gemini Content to DB Schema
        const dbParts = content.parts.map(p => {
            const part = {};
            if (p.text) part.text = p.text;
            if (p.functionCall) part.functionCall = p.functionCall;
            if (p.functionResponse) part.functionResponse = p.functionResponse;
            // Handle raw object if SDK returns strangely
            if (!part.text && !part.functionCall && !part.functionResponse && typeof p === 'string') {
                part.text = p;
            }
            return part;
        });

        chatSession.turns.push({
            role: content.role,
            parts: dbParts
        });
    }

    await chatSession.save();
}
