const Conversation = require('../models/Conversation');
const { ObjectId } = require('mongoose').Types;
const logger = require('../logger');
const colors = require('./colors');

async function updateConversation(user, targetUser, messageText) {
  const userObjectId = new ObjectId(user._id);
  const targetUserObjectId = new ObjectId(targetUser._id);

  try {
    let conversation = await Conversation.findOne({ users: { $all: [userObjectId, targetUserObjectId] } });
    const messageEntry = { sender: userObjectId, content: messageText };

    if (!conversation) {
      conversation = new Conversation({
        users: [userObjectId, targetUserObjectId],
        messages: [messageEntry],
        summary: '',
        lastUpdated: new Date()
      });
      logger.info(`${colors.green}New conversation created between users ${user._id} and ${targetUser._id}${colors.reset}`);
    } else {
      conversation.messages.push(messageEntry);
      if (conversation.messages.length > 5) {
        conversation.messages = conversation.messages.slice(-5); // Keep only the last 5 messages
      }
      logger.info(`${colors.blue}Conversation updated between users ${user._id} and ${targetUser._id}${colors.reset}`);
    }

    conversation.lastUpdated = new Date();
    await conversation.save();
    return conversation;
  } catch (error) {
    logger.error(`${colors.red}Error updating conversation: ${error.message}${colors.reset}`);
    throw new Error('Failed to update conversation');
  }
}

module.exports = { updateConversation };