// models/MonitoredBot.js
const mongoose = require('mongoose');

const botSchema = new mongoose.Schema({
    name: { type: String, required: true },
    token: { type: String, required: true },
    isActive: { type: Boolean, default: true }, // có thể dùng để bật/tắt giám sát,
    // models/MonitoredBot.js (hoặc thêm BotStatus)
    lastCommand: { type: String, default: null },
    lastStatus: { type: String, default: 'N/A' }, // running / success / error
    lastResponseTime: { type: Number, default: 0 } // ms

});

module.exports = mongoose.model('MonitoredBot', botSchema);
