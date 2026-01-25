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

        // 1. Get raw turns
        let relevantTurns = chatSession.turns.slice(-limit);

        // 2. Map & Filter Nulls to clean objects
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


        // 3. STRICT SANITIZATION (Fix Error 400)
        // Rule 1: FunctionResponse must be immediately preceded by FunctionCall.
        // Rule 2: FunctionCall must be immediately followed by FunctionResponse (unless it's the very last turn, which we handle by popping).

        const sanitizedHistory = [];

        for (let i = 0; i < history.length; i++) {
            const turn = history[i];
            const isFunctionResponse = turn.parts.some(p => p.functionResponse);
            const isFunctionCall = turn.parts.some(p => p.functionCall);

            if (isFunctionResponse) {
                // Check previous
                if (sanitizedHistory.length === 0) {
                    // Orphan response at start (due to slice) -> Skip
                    continue;
                }
                const prevTurn = sanitizedHistory[sanitizedHistory.length - 1];
                const prevHasCall = prevTurn.parts.some(p => p.functionCall);

                if (prevTurn.role === 'model' && prevHasCall) {
                    // Valid pair -> Add
                    sanitizedHistory.push(turn);
                } else {
                    // Orphan response -> Skip
                    continue;
                }
            }
            else if (isFunctionCall) {
                // We add it for now, check if it's dangling later
                sanitizedHistory.push(turn);
            }
            else {
                // Normal text -> Add
                sanitizedHistory.push(turn);
            }
        }

        // Rule 2: Remove dangling FunctionCall at the VERY END
        // Because the next turn (current user message) will be text, which violates Call->Response rule.
        if (sanitizedHistory.length > 0) {
            const lastTurn = sanitizedHistory[sanitizedHistory.length - 1];
            const hasFunctionCall = lastTurn.parts.some(p => p.functionCall);

            if (lastTurn.role === 'model' && hasFunctionCall) {
                console.warn('⚠️ Found dangling FunctionCall at end of history. Removing to fix Error 400.');
                sanitizedHistory.pop();
            }
        }

        // Rule 3: Remove dangling FunctionCall in middle (e.g. Call -> UserText)
        // This is rarer but possible if we skipped a response in step 3 loop?
        // Actually step 3 loop handles "Response without Call".
        // Now we need "Call without Response".
        // Iterate again? Or optimize above.
        // Let's do a quick pass to filter out Calls that aren't followed by Response.

        const finalHistory = [];
        for (let i = 0; i < sanitizedHistory.length; i++) {
            const turn = sanitizedHistory[i];
            const isFunctionCall = turn.parts.some(p => p.functionCall);

            if (isFunctionCall) {
                // Look ahead
                const nextTurn = sanitizedHistory[i + 1];
                const nextHasResponse = nextTurn?.parts?.some(p => p.functionResponse);

                if (nextHasResponse) {
                    // Valid sequence
                    finalHistory.push(turn);
                } else {
                    // Dangling Call (followed by text or end of list) -> Remove
                    // (Note: End of list case is already handled, but this covers it too)
                    continue;
                }
            } else {
                finalHistory.push(turn);
            }
        }

        return finalHistory;
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
