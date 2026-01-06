import mongoose from "mongoose";
import { config } from "dotenv";
import PostedNews from "./models/PostedNews.js";

config();

const DEFAULT_CHANNEL_ID = "1406506009631002756";

async function migrate() {
    try {
        console.log("🚀 Starting Migration: PostedNews channelId backfill");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Database Connected");

        // Update all documents that don't have a channelId
        const result = await PostedNews.updateMany(
            { channelId: { $exists: false } }, // Condition
            { $set: { channelId: DEFAULT_CHANNEL_ID } } // Update
        );

        console.log(`✅ Migration Complete. Modified ${result.modifiedCount} documents.`);
    } catch (err) {
        console.error("❌ Migration Failed:", err);
    } finally {
        await mongoose.disconnect();
        console.log("👋 Disconnected");
    }
}

migrate();
