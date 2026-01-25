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

        if (!chatSession || !chatSession.turns || chatSession.turns.length === 0) return [];

        // 1. Get raw turns (Lấy dư ra một chút để tránh cắt vào giữa cặp Function)
        // Lấy limit + 5 turn, sau đó sẽ lọc lại
        let rawTurns = chatSession.turns.slice(-(limit + 5));

        // 2. Map & Clean Data
        let history = rawTurns.map(turn => {
            if (!turn || !turn.parts) return null;

            // Chuyển Mongoose Object sang JS Object thường
            const parts = turn.parts.map(p => {
                const partData = (p.toObject) ? p.toObject() : p;
                // Chỉ lấy các trường hợp lệ của Gemini API
                const cleanPart = {};
                if (partData.text) cleanPart.text = partData.text;
                if (partData.functionCall) cleanPart.functionCall = partData.functionCall;
                if (partData.functionResponse) cleanPart.functionResponse = partData.functionResponse;

                // Nếu rỗng thì bỏ
                return Object.keys(cleanPart).length > 0 ? cleanPart : null;
            }).filter(p => p !== null);

            if (parts.length === 0) return null;

            return {
                role: turn.role,
                parts: parts
            };
        }).filter(t => t !== null);

        // 3. STRICT SANITIZATION (Function Logic)
        // Xử lý các cặp Function Call - Response bị lỗi
        const functionSanitized = [];

        for (let i = 0; i < history.length; i++) {
            const turn = history[i];
            const hasCall = turn.parts.some(p => p.functionCall);
            const hasResponse = turn.parts.some(p => p.functionResponse);

            // A. Xử lý Function Response (Phải có Call liền trước)
            if (hasResponse) {
                const prevTurn = functionSanitized[functionSanitized.length - 1];
                // Nếu turn trước là Model và có Call -> Hợp lệ
                if (prevTurn && prevTurn.role === 'model' && prevTurn.parts.some(p => p.functionCall)) {
                    functionSanitized.push(turn);
                } else {
                    // Nếu không -> Response mồ côi -> Bỏ qua
                    // (Hoặc nếu turn trước là Call nhưng bị user spam text chen giữa -> cũng bỏ Response này đi để tránh lỗi)
                    continue;
                }
            }
            // B. Xử lý Function Call (Phải có Response liền sau, trừ khi là turn cuối cùng)
            else if (hasCall) {
                // Kiểm tra turn tiếp theo trong mảng gốc
                const nextTurn = history[i + 1];
                const nextHasResponse = nextTurn?.parts?.some(p => p.functionResponse);

                if (nextHasResponse) {
                    // Có response đi kèm -> OK
                    functionSanitized.push(turn);
                } else {
                    // Không có response (Dangling Call) -> Bỏ qua luôn
                    // Gemini cực ghét Call mà không có Response
                    continue;
                }
            }
            // C. Text bình thường
            else {
                functionSanitized.push(turn);
            }
        }

        // 4. ROLE ALTERNATION (User -> Model -> User)
        // Đây là bước quan trọng để tránh lỗi 400 do cắt slice
        const finalHistory = [];

        // Duyệt ngược từ cuối lên để lấy những tin nhắn mới nhất
        // Quy tắc: Tin nhắn cuối cùng trong lịch sử GỬI ĐI phải là Model (để lượt tiếp theo User nói)
        // Nhưng ở đây là history context, nên turn cuối cùng trong mảng này có thể là Model hoặc User đều được, 
        // miễn là xen kẽ.

        // Tuy nhiên, QUAN TRỌNG NHẤT: Turn ĐẦU TIÊN của mảng history gửi lên API phải là USER.

        // Hãy lọc xuôi và merge role trùng
        let lastRole = null;

        for (const turn of functionSanitized) {
            // Bỏ qua nếu trùng role liên tiếp (VD: User spam 2 tin, chỉ lấy tin sau hoặc gộp text - ở đây ta chọn cách bỏ tin trước cho đơn giản)
            if (turn.role === lastRole) {
                // Thay thế turn trước bằng turn này (lấy tin mới nhất của cùng 1 role)
                finalHistory.pop();
            }

            finalHistory.push(turn);
            lastRole = turn.role;
        }

        // 5. Đảm bảo BẮT ĐẦU bằng USER
        // Nếu history bắt đầu bằng Model -> Xóa nó đi
        while (finalHistory.length > 0 && finalHistory[0].role === 'model') {
            finalHistory.shift();
        }

        // 6. Áp dụng lại Limit (Cắt đúng số lượng mong muốn sau khi đã lọc sạch)
        return finalHistory.slice(-limit);

    } catch (error) {
        console.error('Error in getHistory:', error);
        return []; // Trả về mảng rỗng để không crash bot, coi như chat mới
    }
}

export async function saveInteraction(chatSession, newContents) {
    try {
        for (const content of newContents) {
            // Deep copy parts để tránh lỗi reference
            const dbParts = content.parts.map(p => {
                const part = {};
                // Ưu tiên check các field object trước
                if (p.functionCall) part.functionCall = p.functionCall;
                else if (p.functionResponse) part.functionResponse = p.functionResponse;
                else if (p.text) part.text = p.text;
                // Fallback nếu p là string
                else if (typeof p === 'string') part.text = p;

                return part;
            });

            chatSession.turns.push({
                role: content.role,
                parts: dbParts
            });
        }

        // Giới hạn lưu trữ trong DB để tránh phình to quá mức (VD: giữ 100 turns)
        if (chatSession.turns.length > 100) {
            chatSession.turns = chatSession.turns.slice(-100);
        }

        await chatSession.save();
    } catch (error) {
        console.error('Failed to save interaction:', error);
    }
}