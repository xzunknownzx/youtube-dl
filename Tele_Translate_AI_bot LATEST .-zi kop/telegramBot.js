require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const logger = require('./logger');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const {
  handleStart,
  handleLanguageChange,
  handleCreateChat,
  handleJoinChat,
  handleRegionChange,
  handleMessage,
  handleEndChat,
  handleKillChat,
  handleClearHistoryConfirmation,
  handleSettings,
  handleOverride,
  sendInitialMenu,
  handleRedoTranslation,
  handleExplainThis
} = require('./services/chatService');
const { logMessage } = require('./messageUtils');
const { getState, setState } = require('./services/stateManager'); // Ensure correct import

const token = process.env.TELEGRAM_BOT_TOKEN;
const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  logger.error('MongoDB URI not defined in environment variables');
  process.exit(1);
}

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    logger.info('MongoDB connected');
    // await clearDatabase(); // Clear the database on startup
  })
  .catch((err) => {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  });

const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (error) => {
  logger.error(`Polling error: ${error.message}`, error);
});

bot.onText(/\/clusers/, async (msg) => {
  try {
    await User.deleteMany({});
    logger.info('Users collection cleared');
  } catch (error) {
    logger.error('Error clearing Users collection:', error.message);
  }
});

bot.onText(/\/clchats/, async (msg) => {
  try {
    await Conversation.deleteMany({});
    logger.info('Conversations collection cleared');
  } catch (error) {
    logger.error('Error clearing Conversations collection:', error.message);
  }
});

bot.onText(/\/clmessages/, async (msg) => {
  try {
    await Message.deleteMany({});
    logger.info('Messages collection cleared');
  } catch (error) {
    logger.error('Error clearing Messages collection:', error.message);
  }
});

bot.onText(/\/cldb/, async (msg) => {
  try {
    await User.deleteMany({});
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    logger.info('Database cleared');
  } catch (error) {
    logger.error('Error clearing database:', error.message);
  }
});

async function checkAndShowStartButton(bot, chatId) {
  try {
    const hasMessages = await hasChatMessages(bot, chatId);

    if (!hasMessages) {
      const user = await User.findOne({ userId: chatId });

      if (!user || !user.connectedChatId) {
        const options = {
          reply_markup: {
            keyboard: [
              [{ text: 'Start' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        };

        await bot.sendMessage(chatId, `Welcome to *Tele_Translate_AI_bot*! Click *Start* to choose your language.`, options);
      }
    }
  } catch (error) {
    logger.error(`Error checking and showing Start button for chatId ${chatId}:`, error.message, error.stack);
  }
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  logger.info(`Received /start command from chatId: ${chatId}`, msg);
  await checkAndShowStartButton(bot, chatId);
  handleStart(bot, msg);
});

bot.onText(/\/kill/, (msg) => {
  logger.info('Received /kill command', msg);
  handleKillChat(bot, msg);
});

// Main bot message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const content = msg.text;

  logger.info(`Message received: ${content} from chatId: ${chatId}`);
  await logMessage(chatId, messageId, 'user', content);
  await handleMessage(bot, msg);
});

// Consolidated callback query handler
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  const chatId = msg.chat.id;
  logger.info(`Callback query received: ${data} from chatId: ${msg.chat.id}`);

  switch (data) {
    case 'change_language':
      await handleStart(bot, callbackQuery.message);
      break;
    case 'override':
      await handleOverride(bot, chatId);
      break;
    case 'settings':
      await handleSettings(bot, chatId);
      break;
    case 'main_menu':
      await sendInitialMenu(bot, chatId);
      break;
    case 'redo_translation':
      await handleRedoTranslation(bot, msg);
      break;
    case 'explain_this':
      await handleExplainThis(bot, msg);
      break;
    default:
      if (data.startsWith('lang_')) {
        const language = data.split('_')[1];
        await handleLanguageChange(bot, msg, language);
        logger.info(`Language selected: ${language} for chatId: ${msg.chat.id}`);
      } else if (data.startsWith('region_')) {
        const region = data.split('_')[1];
        await handleRegionChange(bot, msg, region);
        logger.info(`Region selected: ${region} for chatId: ${msg.chat.id}`);
      } else if (data === 'join_chat') {
        logger.info(`Join chat initiated by chatId: ${msg.chat.id}`);
        await handleJoinChat(bot, msg);
      } else if (data === 'create_chat') {
        logger.info(`Create chat initiated by chatId: ${msg.chat.id}`);
        await handleCreateChat(bot, msg);
      } else if (data === 'end_chat') {
        logger.info(`End chat initiated by chatId: ${msg.chat.id}`);
        await handleEndChat(bot, msg);
      } else if (data === 'clear_history_yes' || data === 'clear_history_no') {
        await handleClearHistoryConfirmation(bot, callbackQuery);
      } else {
        logger.warn('Unknown callback query data:', data);
      }
      break;
  }
});

async function sendMessageWithButtons(bot, chatId, text) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Redo Translation', callback_data: 'redo_translation' }],
        [{ text: 'Explain This', callback_data: 'explain_this' }]
      ]
    }
  };

  const message = await bot.sendMessage(chatId, text, options);

  // Store the message ID with buttons in the user's state
  const userState = getState(chatId);
  if (userState.lastMessageWithButton) {
    try {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: chatId,
        message_id: userState.lastMessageWithButton
      });
    } catch (error) {
      logger.error(`Error removing buttons from message ${userState.lastMessageWithButton} for chat ${chatId}:`, error.message);
    }
  }
  setState(chatId, { lastMessageWithButton: message.message_id });
}

module.exports = {
  bot,
  sendMessageWithButtons // Export the function
};
