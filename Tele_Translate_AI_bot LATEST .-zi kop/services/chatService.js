const { handleStart } = require('./startHandler');
const { handleLanguageSelection, handleLanguageChange } = require('./languageHandler');
const { handleRegionChange, handleRegionSelection } = require('./regionHandler');
const { handleDialectChange, handleDialectSelection } = require('./dialectHandler');
const { sendInitialMenu, handleSettings, deleteMainMenu } = require('./menuHandler');
const { handleCreateChat, handleJoinChat, handleEndChat, handleKillChat, handleCancelCreateChat } = require('./chatHandler');
const { handleMessage, handleMessages, handleRedoTranslation, handleExplainThis, deleteCurrentMessage, getCurrentMessageId } = require('./messageHandler');
const { handleOverride } = require('./overrideHandler');
const { getOriginalText, getEnhancedText } = require('./textHandler');
const { updateConversation } = require('./conversationHandler');
const logger = require('../logger');
const colors = require('./colors');
const { translateMessage } = require('./azureService');
const User = require('../models/User');
const { getState, setState } = require('./stateManager');
const { handleSupportResponse } = require('./supportHandler');

async function handleSupport(bot, callbackQuery) {
  const userId = callbackQuery.from.id;
  const username = callbackQuery.from.username || 'Unknown';
  logger.info(`Support request from user ${username} (${userId})`);
  
  try {
    await deleteMainMenu(bot, userId);
    
    const user = await User.findOne({ userId: userId });
    let language = 'en', region = 'US', dialect = 'General American';
    
    if (user) {
      language = user.language || language;
      region = user.region || region;
      dialect = user.dialect || dialect;
    } else {
      logger.warn(`User not found for userId: ${userId}. Using default language settings.`);
    }
    
    const prompt = "What do you need help with?";
    const translatedPrompt = await translateMessage(prompt, language, region, dialect);
    
    const sentMsg = await bot.sendMessage(userId, translatedPrompt, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Cancel', callback_data: 'cancel_support' }]
        ]
      }
    });
    
    setState(userId, { awaitingSupportResponse: true, supportMessageId: sentMsg.message_id });
    
    logger.info(`Support prompt sent to user ${username} (${userId}) in ${language}-${region} dialect: ${dialect}`);
  } catch (error) {
    logger.error(`Error in handleSupport for userId ${userId}: ${error.message}`);
    await bot.sendMessage(userId, 'An error occurred while processing your support request. Please try again later.');
    await sendInitialMenu(bot, userId);
  }
}

async function handleCancelSupport(bot, callbackQuery) {
  const userId = callbackQuery.from.id;
  const userState = getState(userId);

  if (userState && userState.supportMessageId) {
    try {
      await bot.deleteMessage(userId, userState.supportMessageId);
    } catch (error) {
      logger.warn(`Failed to delete support message for userId: ${userId}. It might have already been deleted.`);
    }
  }

  setState(userId, { awaitingSupportResponse: false, supportMessageId: null });
  await sendInitialMenu(bot, userId);
  logger.info(`Support request cancelled for userId: ${userId}`);
}

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
  handleCancelCreateChat,
  handleMessage,
  handleMessages,
  handleOverride,
  getOriginalText,
  getEnhancedText,
  updateConversation,
  deleteCurrentMessage,
  getCurrentMessageId,
  handleRedoTranslation,
  handleExplainThis,
  handleSupport,
  handleSupportResponse,
  handleCancelSupport
};

// Log that the chatService has been initialized
logger.info(`${colors.green}ChatService initialized${colors.reset}`);