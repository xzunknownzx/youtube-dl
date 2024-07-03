const Message = require('../models/Message');
const logger = require('../logger');

async function saveMessage(conversationId, senderId, originalText, translatedText, dialect) {
  logger.info(`Saving message for conversationId: ${conversationId}, senderId: ${senderId}`);
  const message = new Message({
      conversationId,
      senderId,
      originalText,
      translatedText,
      dialect,
      timestamp: new Date()
  });

  try {
      await message.save();
      logger.info('Message saved successfully');
  } catch (error) {
      logger.error('Error saving message:', error.message, error.stack);
  }
}


module.exports = {
  saveMessage
};
