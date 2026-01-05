const mongoose = require('mongoose');

const WelcomeConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    description: { type: String, required: true }
});

module.exports = mongoose.model('WelcomeConfig', WelcomeConfigSchema);
