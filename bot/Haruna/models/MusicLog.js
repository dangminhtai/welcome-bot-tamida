import mongoose from 'mongoose';

/**
 * Log các thao tác CRUD của lệnh phát nhạc (add/skip/stop) — để tra log, self-test.
 * Mỗi lần /play (thêm), /skip, /stop đều ghi 1 bản ghi.
 */
const musicLogSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    action: { type: String, required: true, enum: ['add', 'skip', 'stop'] },
    track: {
        url: String,
        title: String,
        requestedBy: String,
    },
    requestedBy: { type: String, default: null },
    userId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
});

musicLogSchema.index({ guildId: 1, createdAt: -1 });

export default mongoose.model('MusicLog', musicLogSchema);
