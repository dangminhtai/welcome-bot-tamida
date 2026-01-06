import mongoose from "mongoose";

const newsChannelSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    type: { type: String, default: "hoyolab", enum: ["hoyolab", "giftcode"] }, // Expandable
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: String }
});

// Compound index to prevent duplicate channels for the same type in a guild
newsChannelSchema.index({ guildId: 1, channelId: 1, type: 1 }, { unique: true });

export default mongoose.model("NewsChannel", newsChannelSchema);
