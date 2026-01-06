import mongoose from "mongoose";
const botSchema = new mongoose.Schema({
    name: { type: String, required: true },
    // token: { type: String, required: true },
    botId: { type: String, required: true }, // thêm đây
    isActive: { type: Boolean, default: true }, // có thể dùng để bật/tắt giám sát,
    lastCommand: { type: String, default: null },
    lastStatus: { type: String, default: 'N/A' }, // running / success / error
    lastResponseTime: { type: Number, default: 0 } // ms
});
export default mongoose.model('MonitoredBot', botSchema);
