const mongoose = require('mongoose');
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const logger = require('./logger');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const {
  handleStart,
  handleLanguageChange,
  handleDialectChange,
  handleCreateChat,
  handleJoinChat,
  handleRegionChange,
  handleMessage,
  handleEndChat,
  handleKillChat,
  handleSettings,
  handleOverride,
  sendInitialMenu,
  handleRedoTranslation,
  handleExplainThis,
  getOriginalText,
  getEnhancedText,
  deleteCurrentMessage,
  handleLanguageSelection
} = require('./services/chatService');
const { logMessage } = require('./messageUtils');
const { getState, setState } = require('./services/stateManager');
const { translateMessage, translateVerbatim, analyzeAdvancedContext, translateAdvancedMessage } = require('./services/azureService');

const token = process.env.TELEGRAM_BOT_TOKEN;
const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  logger.error('MongoDB URI not defined in environment variables');
  process.exit(1);
}

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    logger.info('MongoDB connected');
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
  const chatId = msg.chat.id;
  try {
    const users = await User.find({ language: { $exists: true } });
    await User.deleteMany({});
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    logger.info('Database cleared');

    for (const user of users) {
      const userId = user.userId;
      // await bot.sendMessage(userId, 'The bot has restarted. Please select your language again:');
      await handleStart(bot, { chat: { id: userId } });
    }
  } catch (error) {
    logger.error('Error clearing database:', error.message, error.stack);
    await bot.sendMessage(chatId, 'An error occurred while clearing the database. Please try again later.');
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

bot.onText(/\/cancel/, async (msg) => {
  const chatId = msg.chat.id;
  await sendInitialMenu(bot, chatId);
});
const userMessageQueues = {};
const userProcessing = {};

async function processMessageQueue(userId) {
  if (userProcessing[userId]) return;

  userProcessing[userId] = true;

  while (userMessageQueues[userId] && userMessageQueues[userId].length > 0) {
    const { bot, msg } = userMessageQueues[userId].shift();
    await handleMessage(bot, msg);
  }

  userProcessing[userId] = false;
}

async function queueMessage(bot, msg) {
  const userId = msg.chat.id;

  if (!userMessageQueues[userId]) {
    userMessageQueues[userId] = [];
  }

  userMessageQueues[userId].push({ bot, msg });

  await processMessageQueue(userId);
}

bot.on('message', async (msg) => {
  const userId = msg.chat.id;
  const messageId = msg.message_id;
  const content = msg.text || (msg.voice ? 'Voice message received' : '');

  logger.info(`Message received: ${content} from userId: ${userId}`);
  await logMessage(userId, messageId, 'user', content);
  await queueMessage(bot, msg);
});


// Utility function to validate ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) && new mongoose.Types.ObjectId(id).toString() === id;
}

bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  const userId = msg.chat.id;
  const user = await User.findOne({ userId: userId });
  logger.info(`Callback query received: ${data} from userId: ${userId}`);

  try {
    switch (data) {
      case 'change_language':
        await handleStart(bot, callbackQuery.message);
        break;
      case 'override':
        await handleOverride(bot, userId);
        break;
      case 'settings':
        await handleSettings(bot, userId);
        break;
      case 'main_menu':
        await sendInitialMenu(bot, userId);
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
          await handleLanguageSelection(bot, msg, language);
          logger.info(`Language selected: ${language} for userId: ${userId}`);
        } else if (data.startsWith('region_')) {
          const region = data.split('_')[1];
          await handleRegionChange(bot, msg, region);
          logger.info(`Region selected: ${region} for userId: ${userId}`);
        } else if (data.startsWith('dialect_')) {  // Handling dialect selection
          const dialect = data.split('_')[1];
          await handleDialectChange(bot, msg, dialect);
          logger.info(`Dialect selected: ${dialect} for userId: ${userId}`);
        } else if (data.startsWith('refine_translation_')) {
          const messageId = data.split('_').pop();
          logger.info(`Refine translation requested for messageId: ${messageId}`);
          if (isValidObjectId(messageId)) {
            try {
              const originalText = await getOriginalText(messageId, userId);
              logger.info(`Original text retrieved for messageId ${messageId}: ${originalText}`);
              const conversation = await Message.find({ conversationId: originalText.conversationId }).sort({ timestamp: 1 }).exec();

              if (conversation.length > 0) {
                logger.info(`Conversation history found for messageId ${messageId}`);
                const advancedContext = await analyzeAdvancedContext(conversation);
                const advancedTranslation = await translateAdvancedMessage(originalText, advancedContext, user, user, conversation);

                await bot.editMessageText(advancedTranslation, {
                  chat_id: userId,
                  message_id: msg.message_id,
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: 'See Original', callback_data: `see_original_${messageId}` }],
                      [{ text: 'Refine Translation', callback_data: `refine_translation_${messageId}` }],
                      [{ text: 'Return to Enhanced Text', callback_data: `return_enhanced_${messageId}` }]
                    ]
                  }
                });
              } else {
                logger.error(`No conversation history available for messageId ${messageId}.`);
                await bot.sendMessage(userId, 'Unable to refine translation due to missing conversation history.');
              }
            } catch (error) {
              logger.error(`Failed to handle refined translation for messageId ${messageId} for userId ${userId}: ${error.message}`);
              await bot.sendMessage(userId, 'Sorry, there was an error processing your request. Please try again later.');
            }
          } else {
            logger.error(`Invalid ObjectId format for messageId ${messageId}`);
            await bot.sendMessage(userId, 'Invalid message identifier.');
          }
        } else if (data.startsWith('see_original_')) {
          const messageId = data.split('_').pop();
          logger.info(`See original requested for messageId: ${messageId}`);
          if (isValidObjectId(messageId)) {
            try {
              const originalText = await getOriginalText(messageId, userId);
              logger.info(`Original text retrieved for messageId ${messageId}: ${originalText}`);
              const options = [
                [{ text: 'Original in Your Language', callback_data: `original_user_language_${messageId}` }],
                [{ text: 'Original in Sender\'s Language', callback_data: `original_sender_language_${messageId}` }],
                [{ text: 'Refine Translation', callback_data: `refine_translation_${messageId}` }]
              ];
              await bot.editMessageReplyMarkup({ inline_keyboard: options }, {
                chat_id: userId,
                message_id: msg.message_id
              });
            } catch (error) {
              logger.error(`Failed to retrieve original text for messageId ${messageId}: ${error.message}`);
              await bot.sendMessage(userId, 'Error retrieving the original message.');
            }
          } else {
            logger.error(`Invalid ObjectId format for messageId ${messageId}`);
            await bot.sendMessage(userId, 'Invalid message identifier.');
          }
        } else if (data.startsWith('original_user_language_')) {
          const messageId = data.split('_').pop();
          logger.info(`Original user language requested for messageId: ${messageId}`);
          if (isValidObjectId(messageId)) {
            try {
              const userLanguage = user.language;
              let verbatimTranslation;

              const message = await Message.findById(messageId);
              if (message && message.verbatim && message.verbatim[userLanguage]) {
                verbatimTranslation = message.verbatim[userLanguage];
              } else {
                const originalText = await getOriginalText(messageId, userId);
                verbatimTranslation = await translateVerbatim(originalText, userLanguage);

                if (!message.verbatim) message.verbatim = {};
                message.verbatim[userLanguage] = verbatimTranslation;
                await message.save();
              }

              await bot.editMessageText(verbatimTranslation, {
                chat_id: userId,
                message_id: msg.message_id,
                reply_markup: {
                  inline_keyboard: [
                    [{ text: 'Back to Enhanced Text', callback_data: `return_enhanced_${messageId}` }]
                  ]
                }
              });
            } catch (error) {
              logger.error(`Failed to handle original message retrieval or translation for messageId ${messageId} for userId ${userId}: ${error.message}`);
              await bot.sendMessage(userId, 'Sorry, there was an error processing your request. Please try again later.');
            }
          } else {
            logger.error(`Invalid ObjectId format for messageId ${messageId}`);
            await bot.sendMessage(userId, 'Invalid message identifier.');
          }
        } else if (data.startsWith('original_sender_language_')) {
          const messageId = data.split('_').pop();
          logger.info(`Original sender language requested for messageId: ${messageId}`);
          if (isValidObjectId(messageId)) {
            try {
              const originalText = await getOriginalText(messageId, userId);
              await bot.editMessageText(originalText, {
                chat_id: userId,
                message_id: msg.message_id,
                reply_markup: {
                  inline_keyboard: [
                    [{ text: 'Back to Enhanced Text', callback_data: `return_enhanced_${messageId}` }]
                  ]
                }
              });
            } catch (error) {
              logger.error(`Failed to retrieve original text for messageId ${messageId} for userId ${userId}: ${error.message}`);
              await bot.sendMessage(userId, 'Sorry, there was an error processing your request. Please try again later.');
            }
          } else {
            logger.error(`Invalid ObjectId format for messageId ${messageId}`);
            await bot.sendMessage(userId, 'Invalid message identifier.');
          }
        } else if (data.startsWith('return_enhanced_')) {
          const messageId = data.split('_').pop();
          logger.info(`Return to enhanced text requested for messageId: ${messageId}`);
          if (isValidObjectId(messageId)) {
            try {
              const enhancedText = await getEnhancedText(messageId, userId);
              await bot.editMessageText(enhancedText, {
                chat_id: userId,
                message_id: msg.message_id,
                reply_markup: {
                  inline_keyboard: [
                    [{ text: 'See Original', callback_data: `see_original_${messageId}` }]
                  ]
                }
              });
            } catch (error) {
              logger.error(`Failed to retrieve enhanced text for messageId ${messageId} for userId ${userId}: ${error.message}`);
              await bot.sendMessage(userId, 'Sorry, there was an error processing your request. Please try again later.');
            }
          } else {
            logger.error(`Invalid ObjectId format for messageId ${messageId}`);
            await bot.sendMessage(userId, 'Invalid message identifier.');
          }
        } else if (data === 'join_chat') {
          logger.info(`Join chat initiated by userId: ${userId}`);
          await handleJoinChat(bot, msg);
        } else if (data === 'create_chat') {
          logger.info(`Create chat initiated by userId: ${userId}`);
          await handleCreateChat(bot, msg);
        } else if (data === 'end_chat') {
          logger.info(`End chat initiated by userId: ${userId}`);
          await handleEndChat(bot, msg);
        } else if (data === 'clear_history_yes' || data === 'clear_history_no') {
          await handleClearHistoryConfirmation(bot, callbackQuery);
        } else if (data === 'ai_chat') {
          const authPrompt = await bot.sendMessage(userId, 'Please enter your authorization code:');
          await logMessage(userId, authPrompt.message_id, 'bot', 'Please enter your authorization code:');
          const currentMessageId = await getCurrentMessageId(userId);
          bot.once('message', async (msg) => {
            const authCode = msg.text;
            if (authCode === 'wick21') {
              const successMessage = await bot.sendMessage(userId, 'Authorization successful. You can now chat with the AI.');
              await logMessage(userId, successMessage.message_id, 'bot', 'Authorization successful. You can now chat with the AI.');
              await deleteCurrentMessage(bot, userId, currentMessageId);
            } else {
              const failMessage = await bot.sendMessage(userId, 'Invalid authorization code.');
              await logMessage(userId, failMessage.message_id, 'bot', 'Invalid authorization code.');
              await deleteCurrentMessage(bot, userId, currentMessageId);
            }
          });
        } else {
          logger.warn('Unknown callback query data:', data);
        }
    }
  } catch (error) {
    logger.error(`Error handling callback query data: ${data} for userId ${userId}: ${error.message}`);
    await bot.sendMessage(userId, 'An error occurred while processing your request. Please try again later.');
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
  sendMessageWithButtons
};
