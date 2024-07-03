const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  messages: [
    {
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      content: { type: String, required: true },
    },
  ],
  summary: { type: String },
  lastUpdated: { type: Date, default: Date.now },
  connectionCode: { type: String, unique: true, sparse: true } // Ensure unique and sparse index
});

const Conversation = mongoose.model('Conversation', conversationSchema);
module.exports = Conversation;
