const { translateMessage } = require('./azureService');
const { sendInitialMenu } = require('./menuHandler');
const { getState, setState } = require('./stateManager');
const logger = require('../logger');
const User = require('../models/User');

async function handleSupportRequest(bot, userId, username, translatedResponse, originalResponse, timestamp) {
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (!adminChatId) {
    logger.error('Admin chat ID not set in environment variables');
    return;
  }

  const date = new Date(timestamp * 1000).toLocaleString();
  const messageText = `Support request from @${username} (ID: ${userId})\nTime: ${date}\n\nTranslated message:\n${translatedResponse}`;

  try {
    const sentMessage = await bot.sendMessage(adminChatId, messageText, {
      reply_markup: {
        inline_keyboard: [[{ text: 'See Original', callback_data: `support_original_${userId}` }]]
      },
      parse_mode: 'Markdown'
    });

    setState(userId, { originalSupportMessage: originalResponse });

    logger.info(`Support request sent to admin for user ${username} (${userId})`);
  } catch (error) {
    logger.error(`Failed to send support request to admin for user ${username} (${userId}): ${error.message}`);
  }
}

async function handleSupportResponse(bot, msg, user) {
  const userId = msg.chat.id;
  const userResponse = msg.text;
  
  try {
    // Delete the "What can I help you with?" message
    const userState = getState(userId);
    if (userState && userState.supportMessageId) {
      await bot.deleteMessage(userId, userState.supportMessageId);
    }

    // Delete the user's message
    await bot.deleteMessage(userId, msg.message_id);

    const translatedResponse = await translateMessage(userResponse, 'en', 'US', 'General American');
    
    // Send embed message with buttons
    const embedMessage = await bot.sendMessage(userId, 
      `Your support request:\n\n${userResponse}\n\nPlease confirm if you want to send this request.`, 
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Send', callback_data: 'support_send' },
              { text: 'Edit', callback_data: 'support_edit' },
              { text: 'Cancel', callback_data: 'support_cancel' }
            ]
          ]
        },
        parse_mode: 'Markdown'
      }
    );

    setState(userId, { 
      supportEmbedMessageId: embedMessage.message_id,
      supportRequest: userResponse,
      supportTranslatedRequest: translatedResponse
    });

  } catch (error) {
    logger.error(`Error in handleSupportResponse for userId ${userId}: ${error.message}`);
    await bot.sendMessage(userId, 'An error occurred while processing your support request. Please try again later.');
    await sendInitialMenu(bot, userId);
  }
}

async function handleSupportSend(bot, query) {
  const userId = query.from.id;
  const userState = getState(userId);

  try {
    // Delete the embed message
    await bot.deleteMessage(userId, userState.supportEmbedMessageId);

    // Send the support request
    await handleSupportRequest(bot, userId, query.from.username || 'Unknown', userState.supportTranslatedRequest, userState.supportRequest, Date.now() / 1000);

    // Send confirmation message
    const confirmationMsg = await bot.sendMessage(userId, 'Your support request has been sent successfully.', { parse_mode: 'Markdown' });

    // Delete confirmation after 1.2 seconds and show main menu
    setTimeout(async () => {
      try {
        await bot.deleteMessage(userId, confirmationMsg.message_id);
        await sendInitialMenu(bot, userId);
      } catch (error) {
        logger.error(`Error in handleSupportSend cleanup for userId ${userId}: ${error.message}`);
        await sendInitialMenu(bot, userId);
      }
    }, 1200);

    setState(userId, { awaitingSupportResponse: false });
  } catch (error) {
    logger.error(`Error in handleSupportSend for userId ${userId}: ${error.message}`);
    await bot.sendMessage(userId, 'An error occurred while sending your support request. Please try again later.');
    await sendInitialMenu(bot, userId);
  }
}

async function handleSupportEdit(bot, query) {
  const userId = query.from.id;
  const userState = getState(userId);

  try {
    // Delete the embed message
    await bot.deleteMessage(userId, userState.supportEmbedMessageId);

    // Ask the user to provide a new message
    const promptMsg = await bot.sendMessage(userId, 'Please provide your updated support request:');

    setState(userId, { 
      awaitingSupportResponse: true,
      supportMessageId: promptMsg.message_id
    });
  } catch (error) {
    logger.error(`Error in handleSupportEdit for userId ${userId}: ${error.message}`);
    await bot.sendMessage(userId, 'An error occurred while processing your request. Please try again later.');
    await sendInitialMenu(bot, userId);
  }
}

async function handleSupportCancel(bot, query) {
  const userId = query.from.id;
  const userState = getState(userId);

  try {
    // Delete the embed message
    await bot.deleteMessage(userId, userState.supportEmbedMessageId);

    // Send cancellation message
    const cancelMsg = await bot.sendMessage(userId, 'Your support request has been cancelled.');

    // Delete cancellation message after 1.2 seconds and show main menu
    setTimeout(async () => {
      try {
        await bot.deleteMessage(userId, cancelMsg.message_id);
        await sendInitialMenu(bot, userId);
      } catch (error) {
        logger.error(`Error in handleSupportCancel cleanup for userId ${userId}: ${error.message}`);
        await sendInitialMenu(bot, userId);
      }
    }, 1200);

    setState(userId, { awaitingSupportResponse: false });
  } catch (error) {
    logger.error(`Error in handleSupportCancel for userId ${userId}: ${error.message}`);
    await bot.sendMessage(userId, 'An error occurred while cancelling your support request. Please try again later.');
    await sendInitialMenu(bot, userId);
  }
}

module.exports = {
  handleSupportRequest,
  handleSupportResponse,
  handleSupportSend,
  handleSupportEdit,
  handleSupportCancel
};