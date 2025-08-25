const mongoose = require('mongoose');

const welcomeMessageSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  memberId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true },
    customId: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('WelcomeMessage', welcomeMessageSchema);
