const mongoose = require('mongoose');

const MessageLogSchema = new mongoose.Schema({
  chatId: { type: String, required: true },
  messageId: { type: Number, required: true },
  sender: { type: String, required: true }, // 'user' or 'bot'
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MessageLog', MessageLogSchema);
