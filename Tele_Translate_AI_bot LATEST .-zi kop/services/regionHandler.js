const User = require('../models/User');
const logger = require('../logger');
const { handleDialectSelection } = require('./dialectHandler');
const { sendInitialMenu } = require('./menuHandler');  // Add this import
const { regions, dialects } = require('./languages');  // Add dialects to the import
const colors = require('./colors');

async function handleRegionSelection(bot, message, language) {
    logger.info(`${colors.blue}Region selection initiated for chatId=${message.chat.id}, language=${language}${colors.reset}`);
    
    const regionList = regions[`lang_${language}`];
    if (!regionList) {
        logger.error(`${colors.red}No regions found for language=${language}${colors.reset}`);
        await bot.sendMessage(message.chat.id, 'No regions found for the selected language.');
        return;
    }

    const regionOptions = regionList.map(region => ({
        text: region, callback_data: `region_${region.toLowerCase().replace(/ /g, '_')}`
    }));

    const options = {
        reply_markup: JSON.stringify({
            inline_keyboard: regionOptions.map(option => [option])
        }),
        parse_mode: 'Markdown'
    };

    try {
        await bot.sendMessage(message.chat.id, 'Now, select your region \[[step 2/3\]]:', options);
        logger.info(`${colors.blue}Region selection options sent for chatId=${message.chat.id}${colors.reset}`);
    } catch (error) {
        logger.error(`${colors.red}Error sending region selection for chatId=${message.chat.id}${colors.reset}:`, error);
        throw error;
    }
}

async function handleRegionChange(bot, message, region) {
    const userId = message.chat.id;
    logger.info(`${colors.blue}Region change initiated for chatId=${userId}, region=${region}${colors.reset}`);

    try {
        let user = await User.findOne({ userId: userId });
        if (user) {
            user.region = region;
            const languageCode = user.language.replace('lang_', '');
            user.dialect = `${languageCode}-${region.toUpperCase()}`;

            logger.info(`${colors.blue}Setting region=${user.region}, dialect=${user.dialect} for userId=${userId}${colors.reset}`);

            await user.save();
            logger.info(`${colors.green}Region set to ${region} for userId=${userId}${colors.reset}`);

            // Wrap message deletion in try-catch
            try {
                await bot.deleteMessage(userId, message.message_id);
            } catch (deleteError) {
                logger.warn(`${colors.yellow}Failed to delete message for userId=${userId}. Error: ${deleteError.message}${colors.reset}`);
                // Continue with the process even if deletion fails
            }

            const dialectOptions = dialects[user.dialect] || [];
            if (dialectOptions.length > 0) {
                await handleDialectSelection(bot, message, user.dialect);
            } else {
                logger.info(`${colors.yellow}No specific dialects found for region=${region}. Showing main menu.${colors.reset}`);
                await sendInitialMenu(bot, userId);
            }
        } else {
            throw new Error('User not found');
        }
    } catch (error) {
        logger.error(`${colors.red}Error setting region for userId=${userId}${colors.reset}:`, error.message, error.stack);
        await bot.sendMessage(userId, `An error occurred while setting the region. Please try again or contact support.`);
        
        // Return to the main menu or previous step
        await sendInitialMenu(bot, userId);
    }
}

module.exports = { handleRegionSelection, handleRegionChange };