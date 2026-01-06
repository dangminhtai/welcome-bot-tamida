import mongoose from "mongoose";
const PostedNewsSchema = new mongoose.Schema({
    postId: { type: String, unique: true }, // id bài viết Hoyolab
    createdAt: { type: Date, default: Date.now }
});
export default mongoose.model("PostedNews", PostedNewsSchema);
