const mongoose = require('mongoose');
const Message = require('../models/Message');
const logger = require('../logger');

async function saveMessage(conversationId, senderId, originalText, translatedText, dialect) {
  logger.info(`Saving message for conversationId: ${conversationId}, senderId: ${senderId}`);

  try {
    const validConversationId = conversationId ? new mongoose.Types.ObjectId(conversationId) : null;
    const validSenderId = senderId ? new mongoose.Types.ObjectId(senderId) : null;

    const message = new Message({
      conversationId: validConversationId,
      senderId: validSenderId,
      originalText,
      translatedText,
      verbatim: {}, // Initialize the verbatim object
      dialect,
      timestamp: new Date()
    });

    await message.save();
    logger.info('Message saved successfully', { messageId: message._id.toString() });
    return message;
  } catch (error) {
    logger.error('Error saving message:', error.message, error.stack);
    throw new Error('Failed to save message');
  }
}


module.exports = {
  saveMessage
};
