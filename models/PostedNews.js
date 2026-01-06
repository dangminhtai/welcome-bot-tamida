import mongoose from "mongoose";
const PostedNewsSchema = new mongoose.Schema({
    postId: { type: String, required: true }, // id bài viết Hoyolab
    channelId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Ensure unique per post per channel
PostedNewsSchema.index({ postId: 1, channelId: 1 }, { unique: true });

export default mongoose.model("PostedNews", PostedNewsSchema);
