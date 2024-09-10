const MessageLog = require('../models/MessageLog');
const logger = require('../logger');

async function logMessage(chatId, messageId, sender, content) {
  try {
    const log = new MessageLog({ chatId, messageId, sender, content });
    await log.save();
    logger.info(`[messageUtils.js:logMessage] Logged message ${messageId} from ${sender} in chat ${chatId}`);
  } catch (error) {
    logger.error('[messageUtils.js:logMessage] Error logging message:', error.message, error.stack);
  }
}

async function deleteLoggedMessages(bot, chatId) {
  try {
    const messages = await MessageLog.find({ chatId }).select('messageId -_id');
    const deletionPromises = messages.map(async (message) => {
      try {
        await bot.deleteMessage(chatId, message.messageId);
        logger.info(`[messageUtils.js:deleteLoggedMessages] Deleted message with id: ${message.messageId}`);
      } catch (error) {
        logger.warn(`[messageUtils.js:deleteLoggedMessages] Message with id ${message.messageId} not found for chatId ${chatId}. It might have already been deleted.`);
      }
    });
    await Promise.all(deletionPromises);
    await MessageLog.deleteMany({ chatId });
    logger.info(`[messageUtils.js:deleteLoggedMessages] Finished deletion of logged messages in chatId: ${chatId}`);
  } catch (error) {
    logger.error(`[messageUtils.js:deleteLoggedMessages] Error deleting logged messages for chatId ${chatId}:`, error.message);
  }
}

module.exports = { logMessage, deleteLoggedMessages };