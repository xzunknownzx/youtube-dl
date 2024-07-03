const stateManager = require('./stateManager');
const logger = require('../logger');

const setLanguageSelectionState = (userId) => {
  logger.info(`Setting language selection state for userId: ${userId}`);
  stateManager.setState(userId, { currentState: 'language_selection' });
};

const setChatCreationState = (userId) => {
  logger.info(`Setting chat creation state for userId: ${userId}`);
  stateManager.setState(userId, { currentState: 'chat_creation' });
};

const clearUserState = (userId) => {
  logger.info(`Clearing user state for userId: ${userId}`);
  stateManager.clearState(userId);
};

module.exports = {
  setLanguageSelectionState,
  setChatCreationState,
  clearUserState,
};
