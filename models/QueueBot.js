const mongoose = require('mongoose');

const queueBotSchema = new mongoose.Schema({
    name: { type: String, required: true },          // Bot name
    requestedBy: { type: String, default: 'N/A' },   // Tag của người yêu cầu (username#1234 hoặc username)
    requestedById: { type: String, required: true }, // User ID để mention
    addedAt: { type: Date, default: Date.now }       // Ngày thêm vào hàng đợi
});

module.exports = mongoose.model('QueueBot', queueBotSchema);
