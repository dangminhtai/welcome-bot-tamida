import mongoose from "mongoose";

const PostedCodesSchema = new mongoose.Schema({
    postId: { type: String, required: true }, // wiki_${code} — id để tránh trùng
    channelId: { type: String, required: true },
    code: { type: String, required: true }, // Mã giftcode (cột Code)
    postedAt: { type: Date, required: true, default: Date.now }, // Thời gian bot đăng lên kênh
    discoveredAt: { type: Date, required: true }, // Ngày phát hành — cột Duration "Discovered: [date]"
    validUntil: { type: Date, default: null }, // Ngày hết hạn — "Valid until: [date]"; null khi mới phát hành hôm nay (chưa rõ hạn)
    server: { type: String, default: null }, // Cột Server (vd. America, Europe, Asia, TW/HK/Macao)
    rewards: { type: String, default: null } // Cột Rewards — phần thưởng khi đổi code
});

PostedCodesSchema.index({ postId: 1, channelId: 1 }, { unique: true });

export default mongoose.model("PostedCodes", PostedCodesSchema);
