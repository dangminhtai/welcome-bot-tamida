import mongoose from "mongoose";
const completedBotSchema = new mongoose.Schema({
    name: { type: String, required: true }, // Bot name
    requestedBy: { type: String, default: 'N/A' }, // Ai yêu cầu (nếu có)
    finishedAt: { type: Date, default: Date.now } // Ngày hoàn thành
});
export default mongoose.model('CompletedBot', completedBotSchema);
