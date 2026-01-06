import mongoose from "mongoose";
const WelcomeConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    description: { type: String, required: true }
});
export default mongoose.model('WelcomeConfig', WelcomeConfigSchema);
