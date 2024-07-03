const states = {};
const logger = require('../logger');

const getState = (userId) => {
  logger.info(`Getting state for userId: ${userId}`);
  const state = states[userId] || {};
  logger.info(`State for userId ${userId}:`, state);
  return state;
};

const setState = (userId, state) => {
  logger.info(`Setting state for userId: ${userId}`, state);
  states[userId] = { ...getState(userId), ...state, dialect: state.dialect || 'default' };
  logger.info(`Updated state for userId ${userId}:`, states[userId]);
};

const clearState = (userId) => {
  logger.info(`Clearing state for userId: ${userId}`);
  delete states[userId];
  logger.info(`State cleared for userId ${userId}`);
};

const shouldAnalyzeContext = (userId, messageCount) => {
  logger.info(`Checking if should analyze context for userId: ${userId} with messageCount: ${messageCount}`);
  const state = getState(userId);
  if (!state.lastAnalysis || (Date.now() - state.lastAnalysis) > 300000 || messageCount % 3 === 0) { // Analyze every 3 messages or every 5 minutes
    setState(userId, { lastAnalysis: Date.now() });
    logger.info(`Context analysis required for userId ${userId}`);
    return true;
  }
  logger.info(`Context analysis not required for userId ${userId}`);
  return false;
};

const hasChatMessages = async (bot, chatId) => {
  try {
    const chatHistory = await bot.getChat(chatId);
    return chatHistory.messages && chatHistory.messages.length > 0;
  } catch (error) {
    logger.error(`Error checking chat messages for chatId ${chatId}:`, error.message, error.stack);
    return false;
  }
};

module.exports = {
  getState,
  setState,
  clearState,
  shouldAnalyzeContext,
  hasChatMessages
};
