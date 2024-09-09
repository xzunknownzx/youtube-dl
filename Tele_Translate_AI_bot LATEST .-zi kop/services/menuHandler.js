const logger = require('../logger');
const colors = require('./colors');

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
    await bot.sendMessage(chatId, 'How can I assist you further?', options);
}

async function handleSettings(bot, chatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Change Language', callback_data: 'change_language' }],
        [{ text: 'Override', callback_data: 'override' }],
        [{ text: 'Go Back', callback_data: 'main_menu', 'background_color': '#28a745' }]
      ]
    },
    parse_mode: 'Markdown'
  };
  await bot.sendMessage(chatId, 'Settings:', options);
}

module.exports = { sendInitialMenu, handleSettings };