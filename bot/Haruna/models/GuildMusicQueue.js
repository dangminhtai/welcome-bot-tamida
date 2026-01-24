import mongoose from 'mongoose';

/**
 * Hàng chờ nhạc theo guild — dữ liệu CRUD (thêm/xóa/sửa) phải ở DB (lessions_learn).
 * Mỗi /play: $push track. /skip hoặc track chạy xong: $pop phần tử đầu. /stop: $set tracks [].
 */
const guildMusicQueueSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    tracks: [{
        url: { type: String, required: true },
        title: { type: String, default: '' },
        requestedBy: { type: String, default: '' },
        addedAt: { type: Date, default: Date.now },
    }],
    updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model('GuildMusicQueue', guildMusicQueueSchema);
