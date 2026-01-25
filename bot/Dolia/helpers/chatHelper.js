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

        const relevantTurns = chatSession.turns.slice(-limit);

        // 1. Map & Filter Nulls
        let history = relevantTurns.map(turn => {
            if (!turn || !turn.parts) return null;

            const parts = turn.parts.map(p => {
                if (!p) return null;

                const partData = (typeof p.toObject === 'function') ? p.toObject() : p;
                const part = {};

                if (partData.text) part.text = partData.text;
                if (partData.functionCall) part.functionCall = partData.functionCall;
                if (partData.functionResponse) part.functionResponse = partData.functionResponse;

                if (Object.keys(part).length === 0) return null;
                return part;
            }).filter(p => p !== null);

            if (parts.length === 0) return null;

            return {
                role: turn.role,
                parts: parts
            };
        }).filter(t => t !== null);

        // 2. SANITIZE: Xử lý turn cuối bị lỗi (Lỗi 400 Function Call)
        // Nếu turn cuối cùng là 'model' và chứa functionCall, có nghĩa là session trước 
        // bot bị crash chưa kịp lưu functionResponse. 
        // Ta PHẢI xóa nó đi, nếu không khi append user message mới vào sẽ vi phạm quy tắc:
        // Model(Call) -> User(Text) ==> INVALID_ARGUMENT
        if (history.length > 0) {
            const lastTurn = history[history.length - 1];
            const hasFunctionCall = lastTurn.parts.some(p => p.functionCall);

            if (lastTurn.role === 'model' && hasFunctionCall) {
                console.warn('⚠️ Found dangling FunctionCall at end of history. Removing to fix Error 400.');
                history.pop();
            }
        }

        return history;
    } catch (error) {
        console.error('Error in getHistory (Fixed):', error);
        return [];
    }
}

export async function saveInteraction(chatSession, newContents) {
    try {
        for (const content of newContents) {
            const dbParts = content.parts.map(p => {
                const part = {};
                if (p.text) part.text = p.text;
                if (p.functionCall) part.functionCall = p.functionCall;
                if (p.functionResponse) part.functionResponse = p.functionResponse;

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
