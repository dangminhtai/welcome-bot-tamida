
import mongoose from "mongoose";
const monitoredBotSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    botId: { type: String, required: true }, // Add botId for presence check
    isActive: { type: Boolean, default: true },
    token: { type: String, required: false },      // Discord Bot Token
    clientId: { type: String, required: false },   // Discord Client ID
    mongoUri: { type: String, required: false },   // Specific MongoDB URI for this bot
    path: { type: String, default: '' },           // Optional: custom path/folder name
    createdAt: { type: Date, default: Date.now },
    lastCommand: { type: String, default: null },
    lastStatus: { type: String, default: 'N/A' }, // running / success / error
    lastResponseTime: { type: Number, default: 0 } // ms
});
export default mongoose.model('MonitoredBot', monitoredBotSchema);

