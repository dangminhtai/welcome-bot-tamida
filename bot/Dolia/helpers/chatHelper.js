import Chat from '../models/Chat.js';
import User from '../models/User.js';

export async function getChatSession(userId, channelId) {
    try {
        let chatSession = await Chat.findOne({ userId, channelId });
        if (!chatSession) {
            chatSession = new Chat({ userId, channelId, turns: [] });
        }
        return chatSession;
    } catch (error) {
        console.error('Error getting chat session:', error);
        throw error;
    }
}

export async function getHistory(userId, chatSession) {
    try {
        const user = await User.findOne({ userId });
        const limit = user?.chatLimit || 20;

        if (!chatSession || !chatSession.turns) return [];

        // Slice last N turns
        const relevantTurns = chatSession.turns.slice(-limit);

        // Map DB schema to Gemini API Content format
        return relevantTurns.map(turn => {
            if (!turn || !turn.parts) return null;

            const parts = turn.parts.map(p => {
                // FIX CRITICAL: Kiểm tra null trước khi truy cập thuộc tính
                // Đây là nguyên nhân chính gây lỗi Crash App
                if (!p) return null;

                // Xử lý Mongoose Document (an toàn nếu p là object)
                const partData = (typeof p.toObject === 'function') ? p.toObject() : p;

                const part = {};
                // Chỉ copy nếu có dữ liệu thực sự
                if (partData.text) part.text = partData.text;
                if (partData.functionCall) part.functionCall = partData.functionCall;
                if (partData.functionResponse) part.functionResponse = partData.functionResponse;

                // Nếu part rỗng (không có text/call/response), loại bỏ luôn
                if (Object.keys(part).length === 0) return null;

                return part;
            }).filter(p => p !== null); // <--- Lọc bỏ null parts

            if (parts.length === 0) return null;

            return {
                role: turn.role,
                parts: parts
            };
        }).filter(t => t !== null); // <--- Lọc bỏ null turns
    } catch (error) {
        console.error('Error in getHistory (Fixed):', error);
        return []; // Trả về mảng rỗng thay vì làm crash bot
    }
}

export async function saveInteraction(chatSession, newContents) {
    try {
        // newContents: Array of { role, parts }
        for (const content of newContents) {
            const dbParts = content.parts.map(p => {
                const part = {};
                if (p.text) part.text = p.text;
                if (p.functionCall) part.functionCall = p.functionCall;
                if (p.functionResponse) part.functionResponse = p.functionResponse;

                // Fallback: Nếu không phải object chuẩn mà là string, coi là text
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
    } catch (error) {
        console.error('Failed to save interaction:', error);
    }
}
