import { config } from "dotenv";
import mongoose from "mongoose";
import CompletedBot from "../models/CompletedBot.js";
({ config }.config());
const completedBots = [
    { name: 'Hu Tao', requestedBy: 'System' },
    { name: 'Furina', requestedBy: 'System' },
    { name: 'Ganyu', requestedBy: 'System' },
    { name: 'Wanderer', requestedBy: 'System' },
    { name: 'Ayaka', requestedBy: 'System' },
    { name: 'Raiden Shogun', requestedBy: 'System' },
    { name: 'Citlali', requestedBy: 'System' },
    { name: 'Yae Miko', requestedBy: 'System' },
];
async function seed() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to MongoDB');
        await CompletedBot.deleteMany({});
        await CompletedBot.insertMany(completedBots);
        console.log('🚀 Completed bots seeded successfully!');
        mongoose.connection.close();
    }
    catch (err) {
        console.error('❌ Error seeding data:', err);
        mongoose.connection.close();
    }
}
seed();
