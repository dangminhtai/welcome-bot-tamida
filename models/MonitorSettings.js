// models/MonitorSettings.js
const mongoose = require('mongoose');

const monitorSettingsSchema = new mongoose.Schema({
    adminId: { type: String, required: true, unique: true }, // ID của admin
    notificationsEnabled: { type: Boolean, default: true },  // bật/tắt cảnh báo
    updatedAt: { type: Date, default: Date.now }             // thời gian cập nhật
});

module.exports = mongoose.model('MonitorSettings', monitorSettingsSchema);
