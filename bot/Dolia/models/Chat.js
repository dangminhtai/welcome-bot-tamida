import mongoose from "mongoose";

const chatTurnSchema = new mongoose.Schema({
    user: {
        parts: [{ text: { type: String, required: true } }]
    },
    model: {
        parts: [{ text: { type: String, required: true } }]
    },
    createdAt: { type: Date, default: Date.now }
}, { _id: false });

const chatSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    channelId: { type: String, required: true },
    turns: [chatTurnSchema],
});

chatSchema.index({ userId: 1, channelId: 1 });

export default mongoose.model("Chat", chatSchema);
