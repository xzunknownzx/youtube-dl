const User = require('../models/User');
const logger = require('../logger');
const { sendInitialMenu } = require('./menuHandler');
const { escapeMarkdown } = require('./utils');
const { setState, getState } = require('./stateManager');
const { logMessage, deleteLoggedMessages, deleteSetupMessages } = require('../messageUtils');
const { Worker } = require('worker_threads');

async function handleCreateChat(bot, message) {
  const userId = message.chat.id;
  const connectionCode = Math.floor(10000 + Math.random() * 90000).toString();
  logger.info(`Creating chat with connection code: ${connectionCode} for chatId: ${userId}`);

  try {
    await bot.deleteMessage(userId, message.message_id);
  } catch (error) {
    logger.warn(`Failed to delete main menu for userId: ${userId}. It might have already been deleted.`);
  }

  try {
    const user = await User.findOne({ userId: userId });
    if (user) {
      user.connectionCode = connectionCode;
      user.connectionCodeExpiry = new Date(Date.now() + 10 * 60000);
      await user.save();
    } else {
      const telegramName = message.chat.username || message.from.first_name || 'User';
      const newUser = new User({ userId: userId, telegramName, connectionCode, connectionCodeExpiry: new Date(Date.now() + 10 * 60000) });
      await newUser.save();
    }

    const initialMessage = await bot.sendMessage(userId, 
      `Here is your chatroom code. Share it with the person who is joining you in the conversation!\n\`\`\`\n${connectionCode}\n\`\`\`\nThis code will expire in 10:00 minutes.`, 
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: 'Cancel', callback_data: 'cancel_create_chat' }]]
        }
      }
    );

    // Create a worker thread for the countdown
    const worker = new Worker(`
      const { parentPort, workerData } = require('worker_threads');
      let timeLeft = 600;
      const interval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
          clearInterval(interval);
          parentPort.postMessage({ type: 'timeout' });
        } else {
          parentPort.postMessage({ type: 'update', timeLeft });
        }
      }, 1000);
    `, { eval: true });

    worker.on('message', async (message) => {
      if (message.type === 'update') {
        const minutes = Math.floor(message.timeLeft / 60);
        const seconds = message.timeLeft % 60;
        try {
          await bot.editMessageText(
            `Here is your chatroom code. Share it with the person who is joining you in the conversation!\n\`\`\`\n${connectionCode}\n\`\`\`\nThis code will expire in ${minutes}:${seconds.toString().padStart(2, '0')} minutes.`,
            {
              chat_id: userId,
              message_id: initialMessage.message_id,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[{ text: 'Cancel', callback_data: 'cancel_create_chat' }]]
              }
            }
          );
        } catch (error) {
          logger.error(`Failed to update countdown for userId: ${userId}. Error: ${error.message}`);
        }
      } else if (message.type === 'timeout') {
        await handleCreateChatTimeout(bot, userId, initialMessage.message_id);
      }
    });

    setState(userId, { createChatMessageId: initialMessage.message_id, createChatWorker: worker });

  } catch (error) {
    logger.error(`Error in handleCreateChat for userId ${userId}: ${error.message}`);
    await bot.sendMessage(userId, 'An error occurred while creating the chat. Please try again later.');
    await sendInitialMenu(bot, userId);
  }
}

async function handleCancelCreateChat(bot, query) {
  const userId = query.from.id;
  const userState = getState(userId);

  if (userState && userState.createChatWorker) {
    userState.createChatWorker.terminate();
  }

  const user = await User.findOne({ userId: userId });
  if (user) {
    user.connectionCode = null;
    user.connectionCodeExpiry = null;
    await user.save();
  }

  if (userState && userState.createChatMessageId) {
    try {
      await bot.deleteMessage(userId, userState.createChatMessageId);
    } catch (error) {
      logger.warn(`Failed to delete create chat message for userId: ${userId}. It might have already been deleted.`);
    }
  }

  await sendInitialMenu(bot, userId);
  logger.info(`Create chat cancelled for userId: ${userId}`);
}

async function handleCreateChatTimeout(bot, userId, messageId) {
  const userState = getState(userId);
  if (userState && userState.createChatWorker) {
    userState.createChatWorker.terminate();
  }

  const user = await User.findOne({ userId: userId });
  if (user) {
    user.connectionCode = null;
    user.connectionCodeExpiry = null;
    await user.save();
  }

  try {
    await bot.deleteMessage(userId, messageId);
  } catch (error) {
    logger.warn(`Failed to delete expired create chat message for userId: ${userId}. It might have already been deleted.`);
  }

  await sendInitialMenu(bot, userId);
  logger.info(`Create chat timed out for userId: ${userId}`);
}

async function handleJoinChat(bot, message) {
  const userId = message.chat.id;
  logger.info(`Join chat initiated by userId: ${userId}`);

  // Delete the menu message
  try {
    await bot.deleteMessage(userId, message.message_id);
    logger.info(`Deleted menu message for userId: ${userId}`);
  } catch (error) {
    logger.warn(`Failed to delete menu message for userId: ${userId}. It might have already been deleted.`);
  }

  // Delete setup messages (language, region, dialect selection)
  await deleteSetupMessages(bot, userId);

  // Replace the current menu with a message prompting for the connection code
  const promptMessage = await bot.sendMessage(userId, 'Please enter the connection code:', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Cancel', callback_data: 'cancel_join_chat' }]]
    }
  });
  await logMessage(userId, promptMessage.message_id, 'bot', 'Join chat prompt');

  setState(userId, { joiningChat: true, promptMessageId: promptMessage.message_id });

  let attempts = 0;
  const maxAttempts = 5;

  const onMessage = async (msg) => {
    if (msg.chat.id !== userId) return;

    const userState = getState(userId);
    if (!userState.joiningChat) return;

    const connectionCode = msg.text.trim().toUpperCase();
    logger.info(`Received connection code: ${connectionCode} for userId: ${userId}`);

    try {
      await bot.deleteMessage(userId, msg.message_id);
    } catch (error) {
      logger.error(`Error deleting user's code message: ${error.message}`);
    }

    const joinRequestingUser = await User.findOne({ userId: userId });
    if (!joinRequestingUser) {
      logger.warn(`Join requesting user not found for userId: ${userId}`);
      await bot.sendMessage(userId, 'User not found. Please try again.');
      return;
    }

    const userToConnect = await User.findOne({ connectionCode: connectionCode, connectionCodeExpiry: { $gte: new Date() } });
    if (userToConnect) {
      try {
        await User.updateOne(
          { userId: userId },
          {
            connectedChatId: userToConnect.userId,
            connectionCode: null,
            connectionCodeExpiry: null
          }
        );
        await User.updateOne(
          { userId: userToConnect.userId },
          {
            connectedChatId: joinRequestingUser.userId,
            connectionCode: null,
            connectionCodeExpiry: null
          }
        );

        const newOptions = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'End Chat', callback_data: 'end_chat' }],
              [{ text: 'Settings', callback_data: 'settings' }, { text: 'Support', callback_data: 'support' }]
            ]
          },
          parse_mode: 'Markdown'
        };

        const escapedTelegramName1 = escapeMarkdown(userToConnect.telegramName);
        const escapedTelegramName2 = escapeMarkdown(joinRequestingUser.telegramName);

        // Delete all previous messages
        await deleteLoggedMessages(bot, userId);
        await deleteLoggedMessages(bot, userToConnect.userId);

        // Send connection success messages
        const successMessage1 = await bot.sendMessage(userId, `Connected to chat with user: @${escapedTelegramName1}`, newOptions);
        const successMessage2 = await bot.sendMessage(userToConnect.userId, `Connected to chat with user: @${escapedTelegramName2}`, newOptions);
        
        await logMessage(userId, successMessage1.message_id, 'bot', 'Connection success message');
        await logMessage(userToConnect.userId, successMessage2.message_id, 'bot', 'Connection success message');

        logger.info(`Users connected: ${userId} and ${userToConnect.userId}`);

        setState(userId, { joiningChat: false, promptMessageId: null });
        bot.removeListener('message', onMessage);
      } catch (error) {
        logger.error(`Error updating user connection data: ${error.message}`);
        await bot.sendMessage(userId, 'An error occurred while connecting to the chat. Please try again.');
      }
    } else {
      attempts++;
      if (attempts >= maxAttempts) {
        const errorMessage = await bot.editMessageText('Too many incorrect attempts. Returning to the main menu.', {
          chat_id: userId,
          message_id: userState.promptMessageId
        });
        await logMessage(userId, errorMessage.message_id, 'bot', 'Max attempts reached message');
        setTimeout(async () => {
          await deleteLoggedMessages(bot, userId);
          await sendInitialMenu(bot, userId);
        }, 1000);
        setState(userId, { joiningChat: false, promptMessageId: null });
        bot.removeListener('message', onMessage);
      } else {
        const retryMessage = await bot.editMessageText(`Invalid or expired connection code. Please try again. Attempts remaining: ${maxAttempts - attempts}`, {
          chat_id: userId,
          message_id: userState.promptMessageId,
          reply_markup: {
            inline_keyboard: [[{ text: 'Cancel', callback_data: 'cancel_join_chat' }]]
          }
        });
        await logMessage(userId, retryMessage.message_id, 'bot', 'Invalid code retry message');
      }
    }
  };

  bot.on('message', onMessage);
}

async function handleEndChat(bot, message) {
  try {
    const userId = message.chat.id;
    const user = await User.findOne({ userId: userId });
    if (user && user.connectedChatId) {
      const connectedUser = await User.findOne({ userId: user.connectedChatId });
      if (connectedUser) {
        await User.updateOne({ userId: connectedUser.userId }, { connectedChatId: null, connectionCode: null, connectionCodeExpiry: null });
        await bot.sendMessage(connectedUser.userId, 'The chat has been ended by the other user.');
        await sendInitialMenu(bot, connectedUser.userId);
      }

      await User.updateOne({ userId: userId }, { connectedChatId: null, connectionCode: null, connectionCodeExpiry: null });
      await bot.sendMessage(userId, 'You have successfully ended the chat.');
      await sendInitialMenu(bot, userId);

      logger.info(`Chat ended between users: ${userId} and ${connectedUser.userId}`);
    } else {
      await bot.sendMessage(userId, 'You are not currently in a chat.');
      await sendInitialMenu(bot, userId);
      logger.warn(`End chat attempted but no active chat found for userId: ${userId}`);
    }
  } catch (error) {
    logger.error('Error ending chat:', error.message, error.stack);
    await bot.sendMessage(message.chat.id, 'Failed to end chat.');
    await sendInitialMenu(bot, message.chat.id);
  }
}

async function handleKillChat(bot, msg) {
  try {
    const user = await User.findOne({ userId: msg.chat.id });
    if (user && user.connectedChatId) {
      const connectedUser = await User.findOne({ userId: user.connectedChatId });
      if (connectedUser) {
        await User.updateOne({ userId: connectedUser.userId }, { connectedChatId: null });
        await bot.sendMessage(connectedUser.userId, 'The chat has been forcibly ended by the other user.');
        await sendInitialMenu(bot, connectedUser.userId); // Show the main menu to the other user
      }
      user.connectedChatId = null;

      if (!user.telegramName) {
        user.telegramName = 'Unknown';
      }
      if (!user.language) {
        user.language = 'Unknown';
      }
      
      await user.save({ validateModifiedOnly: true });
      await bot.sendMessage(msg.chat.id, 'You have forcibly ended the chat.');
      await sendInitialMenu(bot, msg.chat.id); // Show the main menu to the user who ended the chat

      logger.info(`Chat forcibly ended by userId: ${msg.chat.id}`);
    } else {
      await bot.sendMessage(msg.chat.id, 'You are not currently in a chat.');
      logger.warn(`Forcible end chat attempted but no active chat found for userId: ${msg.chat.id}`);
    }
  } catch (error) {
    logger.error('Error forcibly ending chat:', error.message, error.stack);
    await bot.sendMessage(msg.chat.id, 'Failed to forcibly end chat.');
  }
}

module.exports = { 
  handleCreateChat, 
  handleJoinChat, 
  handleEndChat, 
  handleKillChat,
  handleCancelCreateChat
};