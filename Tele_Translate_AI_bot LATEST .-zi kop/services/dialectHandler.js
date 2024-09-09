const User = require('../models/User');
const logger = require('../logger');
const { sendInitialMenu } = require('./menuHandler');
const { dialects } = require('./languages');
const colors = require('./colors');

async function handleDialectSelection(bot, message, region) {
    logger.info(`${colors.blue}Dialect selection initiated for region=${region}${colors.reset}`);
    const dialectOptions = dialects[region] || [];
    logger.info(`${colors.yellow}Dialects found: ${dialectOptions.length} for region=${region}${colors.reset}`);

    if (dialectOptions.length > 0) {
        const options = dialectOptions.map(dialect => ({
            text: dialect, callback_data: `dialect_${dialect.toLowerCase().replace(/ /g, '_')}`
        }));

        await new Promise(resolve => setTimeout(resolve, 200));
        await bot.deleteMessage(message.chat.id, message.message_id);
        await bot.sendMessage(message.chat.id, 'Now select your dialect \[[step 3/3\]]:', {
            reply_markup: {
                inline_keyboard: options.map(option => [option])
            }
        });
        logger.info(`${colors.green}Dialect options sent to user${colors.reset}`);
    } else {
        logger.info(`${colors.red}No dialects found, moving to main menu${colors.reset}`);
        await sendInitialMenu(bot, message.chat.id);
    }
}

async function handleDialectChange(bot, message, dialect) {
    const userId = message.chat.id;
    logger.info(`${colors.blue}Dialect change initiated for chatId=${userId}, dialect=${dialect}${colors.reset}`);

    try {
        let user = await User.findOne({ userId: userId });
        if (user) {
            user.dialect = dialect;
            await user.save();

            logger.info(`${colors.green}Dialect set to ${dialect} for userId=${userId}${colors.reset}`);

            await new Promise(resolve => setTimeout(resolve, 200));
            await bot.deleteMessage(userId, message.message_id);
            await sendInitialMenu(bot, message.chat.id);
        } else {
            await bot.sendMessage(userId, 'User not found.');
        }
    } catch (error) {
        logger.error(`${colors.red}Error setting dialect for userId=${userId}${colors.reset}:`, error.message);
        await bot.sendMessage(userId, 'Failed to set dialect.');
    }
}

module.exports = { handleDialectSelection, handleDialectChange };