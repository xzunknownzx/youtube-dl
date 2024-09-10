const logger = require('../logger');
const colors = require('./colors');
const { getState, setState } = require('./stateManager');
const { startAIChat } = require('./aiChatHandler');

async function sendInitialMenu(bot, chatId) {
    logger.info(`${colors.blue}Displaying initial menu for chatId=${chatId}${colors.reset}`);
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Join Chat', callback_data: 'join_chat' }, { text: 'Create Chat', callback_data: 'create_chat' }],
                [{ text: 'Export History', callback_data: 'export_history' }, { text: 'AI Chat', callback_data: 'ai_chat' }],
                [{ text: 'Settings', callback_data: 'settings' }, { text: 'Support', callback_data: 'support' }]
            ]
        },
        parse_mode: 'Markdown'
    };
    const sentMessage = await bot.sendMessage(chatId, 'How can I assist you further?', options);
    setState(chatId, { mainMenuMessageId: sentMessage.message_id });
}

async function handleSettings(bot, chatId) {
    // Delete the main menu first
    const userState = getState(chatId);
    if (userState && userState.mainMenuMessageId) {
        try {
            await bot.deleteMessage(chatId, userState.mainMenuMessageId);
        } catch (error) {
            logger.warn(`Failed to delete main menu for userId: ${chatId}. It might have already been deleted.`);
        }
    }

    // Check if there's already a settings menu
    if (userState && userState.settingsMenuMessageId) {
        try {
            await bot.deleteMessage(chatId, userState.settingsMenuMessageId);
        } catch (error) {
            logger.warn(`Failed to delete existing settings menu for userId: ${chatId}. It might have already been deleted.`);
        }
    }

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Change Language', callback_data: 'settings_change_language' }],
                [{ text: 'Override', callback_data: 'settings_override' }],
                [{ text: 'Go Back', callback_data: 'settings_go_back' }]
            ]
        },
        parse_mode: 'Markdown'
    };
    const sentMessage = await bot.sendMessage(chatId, 'Settings:', options);
    setState(chatId, { settingsMenuMessageId: sentMessage.message_id });
}

async function deleteSettingsMenu(bot, chatId) {
    const userState = getState(chatId);
    if (userState && userState.settingsMenuMessageId) {
        try {
            await bot.deleteMessage(chatId, userState.settingsMenuMessageId);
            setState(chatId, { settingsMenuMessageId: null });
        } catch (error) {
            logger.warn(`Failed to delete settings menu for userId: ${chatId}. It might have already been deleted.`);
        }
    }
}

async function deleteMainMenu(bot, chatId) {
    const userState = getState(chatId);
    if (userState && userState.mainMenuMessageId) {
        try {
            await bot.deleteMessage(chatId, userState.mainMenuMessageId);
            setState(chatId, { mainMenuMessageId: null });
        } catch (error) {
            logger.warn(`Failed to delete main menu for userId: ${chatId}. It might have already been deleted.`);
        }
    }
}

async function handleAIChatButton(bot, query) {
    const chatId = query.message.chat.id;
    await deleteMainMenu(bot, chatId);
    await startAIChat(bot, chatId);
}

module.exports = {
    sendInitialMenu,
    handleSettings,
    deleteMainMenu,
    deleteSettingsMenu,
    handleAIChatButton
};