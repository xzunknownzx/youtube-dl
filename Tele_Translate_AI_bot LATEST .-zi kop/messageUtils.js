const axios = require('axios');
const logger = require('./logger');
const MessageLog = require('./models/MessageLog');

async function logMessage(chatId, messageId, sender, content) {
  try {
    const log = new MessageLog({ chatId, messageId, sender, content });
    await log.save();
    logger.info(`Logged message ${messageId} from ${sender} in chat ${chatId}`);
  } catch (error) {
    logger.error('Error logging message:', error.message, error.stack);
  }
}

async function getMessageIdsFromDatabase(chatId) {
  try {
    const messages = await MessageLog.find({ chatId }).select('messageId -_id');
    return messages.map(msg => msg.messageId);
  } catch (error) {
    logger.error('Error fetching message IDs from database:', error.message, error.stack);
    return [];
  }
}

async function deleteMessages(bot, chatId, messages) {
  logger.info(`Deleting ${messages.length} messages for chatId: ${chatId}`);
  for (const messageId of messages) {
    try {
      await bot.deleteMessage(chatId, messageId);
      await MessageLog.deleteOne({ chatId, messageId });
      logger.info(`Deleted message with id: ${messageId}`);
    } catch (error) {
      if (error.response && error.response.body && error.response.body.description === 'Bad Request: message to delete not found') {
        logger.warn(`Message with id ${messageId} not found for chatId ${chatId}. It might have already been deleted.`);
      } else {
        logger.error(`Error deleting message with id ${messageId} for chatId ${chatId}:`, error.message, error.stack);
      }
    }
  }
}

async function deleteAllMessagesInChat(bot, chatId) {
  logger.info(`Starting deletion of all messages in chatId: ${chatId}`);
  const messages = await getMessageIdsFromDatabase(chatId);
  if (messages.length > 0) {
    await deleteMessages(bot, chatId, messages);
  } else {
    logger.info(`No messages to delete for chatId: ${chatId}`);
  }
  logger.info(`Finished deletion of messages in chatId: ${chatId}`);
}

async function deleteLoggedMessages(bot, chatId) {
  try {
    const messages = await MessageLog.find({ chatId }).select('messageId -_id');
    const deletionPromises = messages.map(async (message) => {
      try {
        await bot.deleteMessage(chatId, message.messageId);
        logger.info(`Deleted message with id: ${message.messageId}`);
      } catch (error) {
        logger.warn(`Message with id ${message.messageId} not found for chatId ${chatId}. It might have already been deleted.`);
      }
    });
    await Promise.all(deletionPromises);
    await MessageLog.deleteMany({ chatId });
    logger.info(`Finished deletion of logged messages in chatId: ${chatId}`);
  } catch (error) {
    logger.error(`Error deleting logged messages for chatId ${chatId}:`, error.message);
  }
}

async function deleteSetupMessages(bot, chatId) {
  try {
    const setupMessages = await MessageLog.find({
      chatId,
      content: { $in: [
        'Please wait...',
        'Welcome! Please select your language. [[step 1/3]]:',
        'Now, select your region [[step 2/3]]:',
        'Now select your dialect [[step 3/3]]:'
      ]}
    }).select('messageId -_id');

    const deletionPromises = setupMessages.map(async (message) => {
      try {
        await bot.deleteMessage(chatId, message.messageId);
        logger.info(`Deleted setup message with id: ${message.messageId}`);
      } catch (error) {
        logger.warn(`Setup message with id ${message.messageId} not found for chatId ${chatId}. It might have already been deleted.`);
      }
    });
    await Promise.all(deletionPromises);
    await MessageLog.deleteMany({
      chatId,
      content: { $in: [
        'Please wait...',
        'Welcome! Please select your language. [[step 1/3]]:',
        'Now, select your region [[step 2/3]]:',
        'Now select your dialect [[step 3/3]]:'
      ]}
    });
    logger.info(`Finished deletion of setup messages in chatId: ${chatId}`);
  } catch (error) {
    logger.error(`Error deleting setup messages for chatId ${chatId}:`, error.message);
  }
}

module.exports = {
  logMessage,
  deleteLoggedMessages,
  deleteAllMessagesInChat,
  deleteSetupMessages,  // Add this line
};
