const User = require('../models/User');
const { handleSettings } = require('./menuHandler');
const logger = require('../logger');
const colors = require('./colors');

async function handleOverride(bot, chatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Cancel', callback_data: 'settings' }]
      ]
    },
    parse_mode: 'Markdown'
  };
  await bot.sendMessage(chatId, 'Enter authorization code:', options);

  bot.once('message', async (msg) => {
    const authCode = msg.text;
    if (authCode === process.env.OVERRIDE_AUTH_CODE) {
      await bot.sendMessage(chatId, 'Authorization successful. Enter custom language:');
      bot.once('message', async (msg) => {
        const customLanguage = msg.text;
        await bot.sendMessage(chatId, 'Enter custom dialect:');
        bot.once('message', async (msg) => {
          const customDialect = msg.text;
          const user = await User.findOne({ userId: chatId });
          if (user) {
            user.language = customLanguage;
            user.dialect = customDialect;
            await user.save();
            logger.info(`${colors.green}Custom language and dialect set for userId=${chatId}: ${customLanguage} - ${customDialect}${colors.reset}`);
            await bot.sendMessage(chatId, `Custom language and dialect set to: ${customLanguage} - ${customDialect}`);
            await handleSettings(bot, chatId);
          } else {
            logger.warn(`${colors.yellow}User not found for userId=${chatId} during override${colors.reset}`);
            await bot.sendMessage(chatId, 'User not found. Please try again.');
          }
        });
      });
    } else {
      logger.warn(`${colors.yellow}Invalid authorization code entered by userId=${chatId}${colors.reset}`);
      await bot.sendMessage(chatId, 'Invalid authorization code.');
      await handleSettings(bot, chatId);
    }
  });
}

module.exports = { handleOverride };