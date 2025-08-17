const mongoose = require("mongoose");

const PostedNewsSchema = new mongoose.Schema({
  postId: { type: String, unique: true }, // id bài viết Hoyolab
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("PostedNews", PostedNewsSchema);
