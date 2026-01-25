import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    chatLimit: { type: Number, default: 20 },
});

export default mongoose.model("User", userSchema);
