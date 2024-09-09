const Message = require('../models/Message');
const logger = require('../logger');
const colors = require('./colors');

async function getOriginalText(messageId, userId) {
  try {
    const message = await Message.findById(messageId).exec();
    if (!message) {
      logger.error(`${colors.red}Message with ID ${messageId} not found for userId ${userId}${colors.reset}`);
      throw new Error(`Message with ID ${messageId} not found`);
    }

    return message.originalText;
  } catch (error) {
    logger.error(`${colors.red}Error retrieving original text for messageId ${messageId}: ${error.message}${colors.reset}`);
    throw new Error(`Failed to retrieve original text for messageId ${messageId}`);
  }
}

async function getEnhancedText(messageId, userId) {
  try {
    const message = await Message.findById(messageId).exec();
    if (!message) {
      logger.error(`${colors.red}Message with ID ${messageId} not found${colors.reset}`);
      throw new Error(`Message with ID ${messageId} not found`);
    }

    return message.translatedText;
  } catch (error) {
    logger.error(`${colors.red}Error retrieving enhanced text for messageId ${messageId}: ${error.message}${colors.reset}`);
    throw new Error(`Failed to retrieve enhanced text for messageId ${messageId}`);
  }
}

module.exports = { getOriginalText, getEnhancedText };