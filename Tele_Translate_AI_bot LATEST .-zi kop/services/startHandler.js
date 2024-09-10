const User = require('../models/User');
const logger = require('../logger');
const { logMessage } = require('./messageUtils');  // Update this line
const { languageOptions } = require('./languages');
const colors = require('./colors');

function chunk(array, size) {
  const chunked = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  if (!msg || !msg.chat || !msg.chat.id) {
    logger.error(`[startHandler.js:handleStart] ${colors.red}Invalid message object received in handleStart${colors.reset}`, msg);
    return;
  }

  logger.info(`[startHandler.js:handleStart] ${colors.blue}Received /start command from chatId=${chatId}${colors.reset}`);

  let user = await User.findOne({ userId: chatId });
  if (user && user.connectedChatId) {
    logger.info(`${colors.yellow}User is currently in a chat with connectedChatId=${user.connectedChatId}${colors.reset}`);
    await bot.sendMessage(chatId, `You are currently in a chat. Please end the current chat before starting a new one.`);
    return;
  }

  // Send "Please wait..." message
  const waitMessage = await bot.sendMessage(chatId, 'Please wait...');
  await logMessage(chatId, waitMessage.message_id, 'bot', 'Please wait...');

  // Wait for a short time to show the "Please wait..." message
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Delete the "Please wait..." message
  try {
    await bot.deleteMessage(chatId, waitMessage.message_id);
  } catch (error) {
    logger.warn(`[startHandler.js:handleStart] Failed to delete "Please wait..." message: ${error.message}`);
  }

  logger.info(`[startHandler.js:handleStart] ${colors.blue}Starting language selection for chatId=${chatId}${colors.reset}`);

  const languageOptionsMarkup = {
    reply_markup: {
      inline_keyboard: [
        languageOptions.slice(0, 2),
        ...chunk(languageOptions.slice(2), 3)
      ]
    },
    parse_mode: 'Markdown'
  };

  const langMessage = await bot.sendMessage(chatId, 'Welcome! Please select your language. \[[step 1/3\]]:', languageOptionsMarkup);
  await logMessage(chatId, langMessage.message_id, 'bot', 'Language selection menu');
}

module.exports = { handleStart };