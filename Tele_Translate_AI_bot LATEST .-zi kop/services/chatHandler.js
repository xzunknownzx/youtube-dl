const User = require('../models/User');
const Conversation = require('../models/Conversation');
const logger = require('../logger');
const colors = require('./colors');
const { sendInitialMenu } = require('./menuHandler');
const { escapeMarkdown } = require('./utils');

// Handle create chat
async function handleCreateChat(bot, message) {
  const connectionCode = Math.floor(10000 + Math.random() * 90000).toString(); // Generate a 5-digit code
  logger.info(`Creating chat with connection code: ${connectionCode} for chatId: ${message.chat.id}`);

  const user = await User.findOne({ userId: message.chat.id });
  if (user) {
    user.connectionCode = connectionCode;
    user.connectionCodeExpiry = new Date(Date.now() + 10 * 60000);
    await user.save();
  } else {
    const telegramName = message.chat.username || message.from.first_name || 'User';
    const newUser = new User({ userId: message.chat.id, telegramName, connectionCode, connectionCodeExpiry: new Date(Date.now() + 10 * 60000) });
    await newUser.save();
  }

  await bot.sendMessage(message.chat.id, `Here is your chatroom code. Share it with the person who is joining you in the conversation!\n\`\`\`\n${connectionCode}\n\`\`\``, { parse_mode: 'Markdown' });
}

async function handleJoinChat(bot, message) {
  const userId = message.chat.id;
  logger.info(`Join chat initiated by userId: ${userId}`);
  let promptMessage = await bot.sendMessage(userId, 'Please enter the connection code:');

  let attempts = 0;
  const maxAttempts = 5;
  let invalidMessageId;

  const onMessage = async (msg) => {
    if (msg.chat.id !== userId) {
      return;
    }

    const connectionCode = msg.text.trim().toUpperCase();
    logger.info(`Received connection code: ${connectionCode} for userId: ${userId}`);

    const joinRequestingUser = await User.findOne({ userId: userId });
    if (!joinRequestingUser) {
      logger.warn(`Join requesting user not found for userId: ${userId}`);
      await bot.sendMessage(userId, 'User not found. Please try again.');
      return;
    }

    const userToConnect = await User.findOne({ connectionCode: connectionCode, connectionCodeExpiry: { $gte: new Date() } });
    if (userToConnect) {
      logger.info(`User to connect found: ${JSON.stringify(userToConnect)}`);
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

        await bot.sendMessage(userId, `Connected to chat with user: @${escapedTelegramName1}`, newOptions);
        await bot.sendMessage(userToConnect.userId, `Connected to chat with user: @${escapedTelegramName2}`, newOptions);

        logger.info(`Users connected: ${userId} and ${userToConnect.userId}`);

        bot.removeListener('message', onMessage); // Remove the listener after successful connection
      } catch (error) {
        logger.error(`Error updating user connection data: ${error.message}`);
        await bot.sendMessage(userId, 'An error occurred while connecting to the chat. Please try again.');
      }
    } else {
      attempts++;
      await bot.deleteMessage(userId, msg.message_id);
      if (invalidMessageId) {
        await bot.deleteMessage(userId, invalidMessageId);
      }
      await bot.deleteMessage(userId, promptMessage.message_id);

      if (attempts >= maxAttempts) {
        await bot.sendMessage(userId, 'Too many incorrect attempts. Returning to the main menu.');
        await sendInitialMenu(bot, userId);
        bot.removeListener('message', onMessage); // Remove the listener after max attempts
      } else {
        const invalidMessage = await bot.sendMessage(userId, 'Invalid or expired connection code. Please check with the user who invited you for a new code and paste it below. You can also type /cancel to return to the main menu.');
        invalidMessageId = invalidMessage.message_id;
        promptMessage = await bot.sendMessage(userId, 'Please enter the connection code:');
        logger.warn(`Invalid or expired connection code: ${connectionCode} for userId: ${userId}`);
      }
    }
  };

  bot.on('message', onMessage);
}

async function handleEndChat(bot, message) {
  try {
    const userId = message.chat.id; // Consistent use of userId
    const user = await User.findOne({ userId: userId });
    if (user && user.connectedChatId) {
      const connectedUser = await User.findOne({ userId: user.connectedChatId });
      if (connectedUser) {
        await connectedUser.updateOne({ connectedChatId: "", connectionCode: "", connectionCodeExpiry: null });
        await bot.sendMessage(connectedUser.userId, 'The chat has been ended by the other user.');
        await sendInitialMenu(bot, connectedUser.userId); // Show the main menu to the other user
      }

      await user.updateOne({ connectedChatId: "", connectionCode: "", connectionCodeExpiry: null });
      await bot.sendMessage(userId, 'You have successfully ended the chat.');
      await sendInitialMenu(bot, userId); // Show the main menu to the user who ended the chat

      logger.info(`Chat ended between users: ${userId} and ${connectedUser.userId}`);
    } else {
      await bot.sendMessage(userId, 'You are not currently in a chat.');
      logger.warn(`End chat attempted but no active chat found for userId: ${userId}`);
    }
  } catch (error) {
    logger.error('Error ending chat:', error.message, error.stack);
    await bot.sendMessage(message.chat.id, 'Failed to end chat.');
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

module.exports = { handleCreateChat, handleJoinChat, handleEndChat, handleKillChat };