import mongoose from "mongoose";
const monitorSettingsSchema = new mongoose.Schema({
    adminId: { type: String, required: true, unique: true }, // ID của admin
    notificationsEnabled: { type: Boolean, default: true }, // bật/tắt cảnh báo
    updatedAt: { type: Date, default: Date.now } // thời gian cập nhật
});
export default mongoose.model('MonitorSettings', monitorSettingsSchema);
