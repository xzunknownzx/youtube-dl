const User = require('../models/User');
const logger = require('../logger');
const { logMessage } = require('../messageUtils');
const { handleMessages } = require('./messageHandler');
const { handleRegionSelection } = require('./regionHandler');
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
    logger.error(`${colors.red}Invalid message object received in handleStart${colors.reset}`, msg);
    return;
  }

  logger.info(`${colors.blue}Received /start command from chatId=${chatId}${colors.reset}`);

  let user;
  try {
    user = await User.findOne({ userId: chatId });
  } catch (error) {
    logger.error(`${colors.red}Error finding user for chatId=${chatId}${colors.reset}:`, error.message);
  }

  if (user) {
    logger.info(`${colors.green}User found for chatId=${chatId}${colors.reset}`);
    if (user.connectedChatId) {
      logger.info(`${colors.yellow}User is currently in a chat with connectedChatId=${user.connectedChatId}${colors.reset}`);
      await bot.sendMessage(chatId, `You are currently in a chat. Please end the current chat before starting a new one.`);
      return;
    }
  } else {
    logger.info(`${colors.green}User not found for chatId=${chatId}. Creating new user entry.${colors.reset}`);
    const telegramName = msg.chat.username || msg.from.first_name || 'User';
    const newUser = new User({ userId: chatId, telegramName });
    try {
      await newUser.save();
      logger.info(`${colors.green}New user created with chatId=${chatId}${colors.reset}`);
    } catch (error) {
      logger.error(`${colors.red}Error creating new user with chatId=${chatId}${colors.reset}:`, error.message);
    }
  }

  logger.info(`${colors.blue}Starting handleStart for chatId=${chatId}${colors.reset}`);

  const removeMsg = await bot.sendMessage(chatId, 'Please wait...', {
    reply_markup: {
      remove_keyboard: true
    }
  });

  await handleMessages(bot, chatId, msg, removeMsg);
  await logMessage(chatId, removeMsg.message_id, 'bot', 'Please wait...');

  // Delete the initial message, with a delay to ensure it's deleted before the next steps
  await new Promise(resolve => setTimeout(resolve, 800));

  // Delete the "Please wait..." message
  try {
    await bot.deleteMessage(chatId, removeMsg.message_id);
    logger.info(`${colors.green}Deleted 'Please wait...' message with id=${removeMsg.message_id} for chatId=${chatId}${colors.reset}`);
  } catch (error) {
    logger.error(`${colors.red}Error deleting 'Please wait...' message with id=${removeMsg.message_id}${colors.reset}:`, error.message);
  }

  const languageOptionsMarkup = {
    reply_markup: {
      inline_keyboard: [
        languageOptions.slice(0, 2),
        ...chunk(languageOptions.slice(2), 3)
      ]
    },
    parse_mode: 'Markdown'
  };

  await bot.sendMessage(chatId, 'Welcome! Please select your language. \[[step 1/3\]]:', languageOptionsMarkup);
}

module.exports = { handleStart };