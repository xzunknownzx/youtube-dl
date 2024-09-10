const User = require('../models/User');
const logger = require('../logger');
const { handleRegionSelection } = require('./regionHandler');
const colors = require('./colors');

async function handleLanguageSelection(bot, message, language) {
    const userId = message.chat.id;
    const telegramName = message.chat.username || message.from.first_name || 'User';
    logger.info(`${colors.blue}Language selection initiated for chatId=${userId}, language=${language}${colors.reset}`);

    try {
        let user = await User.findOne({ userId: userId });
        if (!user) {
            user = new User({ userId, language, telegramName });
        } else {
            user.language = language;
            user.telegramName = telegramName;
        }

        // Delete the language selection menu
        await bot.deleteMessage(userId, message.message_id);

        // Send "Please wait..." message
        const waitMessage = await bot.sendMessage(userId, 'Language selected. Please wait...');

        await user.save();
        logger.info(`${colors.green}Language set to ${language} for userId=${userId}${colors.reset}`);

        // Wait for a short time to show the "Please wait..." message
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Delete the "Please wait..." message
        await bot.deleteMessage(userId, waitMessage.message_id);

        logger.info(`${colors.blue}Calling handleRegionSelection for chatId=${userId}${colors.reset}`);
        await handleRegionSelection(bot, message, language);

    } catch (error) {
        logger.error(`${colors.red}Error setting language for userId=${userId}${colors.reset}:`, error.message);
        await bot.sendMessage(userId, 'Failed to set language.');
    }
}

async function handleLanguageChange(bot, msg) {
    const userId = msg.chat.id;
    logger.info(`${colors.blue}Language change initiated for chatId=${userId}${colors.reset}`);
    
    // This is essentially the same as handleStart in the old chatService.js
    await handleLanguageSelection(bot, msg, null);
}

module.exports = { handleLanguageSelection, handleLanguageChange };