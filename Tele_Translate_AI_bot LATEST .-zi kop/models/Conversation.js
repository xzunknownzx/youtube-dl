const mongoose = require('mongoose');

// Schema for the Conversation model
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
  connectionCode: { type: String, unique: true, sparse: true }
});

const Conversation = mongoose.model('Conversation', conversationSchema);
module.exports = Conversation;