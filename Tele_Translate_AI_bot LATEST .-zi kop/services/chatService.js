const { handleStart } = require('./startHandler');
const { handleLanguageSelection, handleLanguageChange } = require('./languageHandler');
const { handleRegionChange, handleRegionSelection } = require('./regionHandler');
const { handleDialectChange, handleDialectSelection } = require('./dialectHandler');
const { sendInitialMenu, handleSettings } = require('./menuHandler');
const { handleCreateChat, handleJoinChat, handleEndChat, handleKillChat } = require('./chatHandler');
const { handleMessage, handleMessages, handleRedoTranslation, handleExplainThis, deleteCurrentMessage, getCurrentMessageId } = require('./messageHandler');
const { handleOverride } = require('./overrideHandler');
const { getOriginalText, getEnhancedText } = require('./textHandler');
const { updateConversation } = require('./conversationHandler');
const logger = require('../logger');
const colors = require('./colors');

module.exports = {
  handleStart,
  handleLanguageSelection,
  handleLanguageChange,
  handleRegionChange,
  handleRegionSelection,
  handleDialectChange,
  handleDialectSelection,
  sendInitialMenu,
  handleSettings,
  handleCreateChat,
  handleJoinChat,
  handleEndChat,
  handleKillChat,
  handleMessage,
  handleMessages,
  handleOverride,
  getOriginalText,
  getEnhancedText,
  updateConversation,
  deleteCurrentMessage,
  getCurrentMessageId,
  handleRedoTranslation,
  handleExplainThis
};

// Log that the chatService has been initialized
logger.info(`${colors.green}ChatService initialized${colors.reset}`);