const axios = require('axios');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { translateMessage, analyzeContext, generateEnhancedPrompt, transcribeAudio, constructLanguageIdentifier, cleanAudio } = require('./azureService');
const { saveMessage } = require('./messageService');
const logger = require('../logger');
require('dotenv').config();
const { languageOptions, regions, dialectMapping, dialects } = require('./languages.js');
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const mongoose = require('mongoose');

// Handle join chat
const { ObjectId } = require('mongoose').Types;
const { logMessage } = require('../messageUtils');
const { getState, setState } = require('./stateManager');
const fs = require('fs');

// Define neon colors for logging
const colors = {
    reset: "\x1b[0m",
    blue: "\x1b[34m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    bold: "\x1b[1m",
    neonBlue: "\x1b[1;34m\x1b[5m",   // Bright neon blue
    neonGreen: "\x1b[1;32m\x1b[5m",  // Bright neon green
    neonYellow: "\x1b[1;33m\x1b[5m", // Bright neon yellow
    neonRed: "\x1b[1;31m\x1b[5m",    // Bright neon red
    neonMagenta: "\x1b[1;35m\x1b[5m" // Bright neon magenta
};

// Separator for log sections
const separator = `${colors.bold}${colors.cyan}---------------------------------------------------${colors.reset}`;
function chunk(array, size) {
  const chunked = [];
  for (let i = 0; i < array.length; i += size) {
      chunked.push(array.slice(i, i + size));
  }
  return chunked;
}
function escapeMarkdown(text) {
  return text.replace(/([_*\[\]()~`>#+-=|{}.!\\])/g, '\\$1').replace(/\\([0-9])/g, '$1');
}
// Function to get the most recent message in the chat
async function getCurrentMessageId(chatId) {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`, {
      params: {
        limit: 1, // We only need the latest message
        offset: -1 // This ensures we get the most recent message
      }
    });

    if (response.data.ok) {
      const messages = response.data.result
        .filter(update => update.message && update.message.chat && update.message.chat.id === chatId);
      if (messages.length > 0) {
        return messages[0].message.message_id;
      }
    } else {
      console.error('Error fetching messages:', response.data.description);
      return null;
    }
  } catch (error) {
    console.error('Error fetching messages:', error.message, error.stack);
    return null;
  }
}

// Function to delete a specific message in the chat
async function deleteCurrentMessage(bot, chatId, messageId) {
  if (messageId) {
      try {
          await bot.deleteMessage(chatId, messageId);
          console.info(`Deleted current message with id: ${messageId} for chatId: ${chatId}`);
      } catch (error) {
          console.error(`Error deleting current message with id ${messageId} for chatId ${chatId}:`, error.message, error.stack);
      }
  } else {
      console.info(`No current message found to delete for chatId: ${chatId}`);
  }
}

// New async function to encapsulate the flow
async function handleMessages(bot, chatId, msg, removeMsg) {
  await logMessage(chatId, removeMsg.message_id, 'bot', 'Please wait...');
  await new Promise(resolve => setTimeout(resolve, 800));
  try {
      await bot.deleteMessage(chatId, msg.message_id);
      logger.info(`${colors.green}Deleted initial message with id=${msg.message_id} for chatId=${chatId}${colors.reset}`);
      await logMessage(chatId, msg.message_id, 'deleted', '');
  } catch (error) {
      logger.error(`${colors.red}Error deleting initial message with id=${msg.message_id}${colors.reset}:`, error.message);
  }
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

        await bot.editMessageText('Language selected. Please wait...', {
            chat_id: message.chat.id,
            message_id: message.message_id
        });

        await user.save();
        logger.info(`${colors.green}Language set to ${language} for userId=${userId}${colors.reset}`);

        await new Promise(resolve => setTimeout(resolve, 250));
        await bot.deleteMessage(userId, message.message_id);

        logger.info(`${colors.blue}Calling handleRegionSelection for chatId=${userId}${colors.reset}`);
        await handleRegionSelection(bot, message, language);

    } catch (error) {
        logger.error(`${colors.red}Error setting language for userId=${userId}${colors.reset}:`, error.message);
        await bot.sendMessage(message.chat.id, 'Failed to set language.');
    }
}

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
            // Set region
            user.region = region;
            
            // Set dialect based on the language and region
            const languageCode = user.language.replace('lang_', '');
            user.dialect = `${languageCode}-${region.toLowerCase().replace(/ /g, '_')}`;

            // Log the values being set
            logger.info(`${colors.blue}Setting region=${user.region}, dialect=${user.dialect} for userId=${userId}${colors.reset}`);

            // Save the user details
            await user.save();
            logger.info(`${colors.green}Region set to ${region} for userId=${userId}${colors.reset}`);

            // Proceed with dialect selection
            await new Promise(resolve => setTimeout(resolve, 200));
            await handleDialectSelection(bot, message, user.dialect);
        } else {
            throw new Error('User not found');
        }
    } catch (error) {
        logger.error(`${colors.red}Error setting region for userId=${userId}${colors.reset}:`, error.message, error.stack);
        await bot.sendMessage(userId, `Failed to set region. Please try again or contact support.`);
        
        // Return to the main menu or previous step
        await sendInitialMenu(bot, userId);
    }
}

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

            // Proceed to the main menu
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
        [{ text: 'Go Back', callback_data: 'main_menu', 'background_color': '#28a745' }] // green color for Go Back button
      ]
    },
    parse_mode: 'Markdown'
  };
  await bot.sendMessage(chatId, 'Settings:', options);
}


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
    if (authCode === 'wick21') {
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
            await bot.sendMessage(chatId, `Custom language and dialect set to: ${customLanguage} - ${customDialect}`);
            await handleSettings(bot, chatId);
          }
        });
      });
    } else {
      await bot.sendMessage(chatId, 'Invalid authorization code.');
      await handleSettings(bot, chatId);
    }
  });
}


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

async function handleMessage(bot, msg) {
  const userId = msg.chat.id;
  console.log(`Handling message for userId: ${userId}`);

  const user = await User.findOne({ userId: userId });
  if (!user) {
      console.warn(`User not found for userId: ${userId}`);
      await bot.sendMessage(userId, 'User not found.');
      return;
  }

  let messageContent = '';
  
  // Handle voice messages
  if (msg.voice) {
      const fileId = msg.voice.file_id;
      try {
          const filePath = await bot.getFileLink(fileId);
          const fileName = `${fileId}.oga`;

          const response = await axios({
              url: filePath,
              method: 'GET',
              responseType: 'stream'
          });
          const fileStream = fs.createWriteStream(fileName);
          response.data.pipe(fileStream);

          await new Promise((resolve, reject) => {
              fileStream.on('finish', resolve);
              fileStream.on('error', reject);
          });

          console.log(`Voice message download completed for ${fileName}`);

          // Conditionally clean the audio if caption contains 'filter'
          let cleanedFileName = fileName;
          if (msg.caption && msg.caption.toLowerCase() === 'filter') {
              console.log('Applying noise suppression with sh.rnnn model...');
              cleanedFileName = await cleanAudio(fileName);
          }

          // Transcription logic
          const languageIdentifier = constructLanguageIdentifier(user.language, user.location);
          const transcription = await transcribeAudio(cleanedFileName, languageIdentifier);

          if (transcription && transcription.text) {
              messageContent = transcription.text;
              console.log(`Transcription result: ${messageContent}`);
          } else {
              console.error('Transcription failed or returned no text.');
              await bot.sendMessage(userId, 'Failed to retrieve transcription text. Please try again.');
              return;
          }

          // Clean up files
          fs.unlinkSync(fileName);
          if (cleanedFileName !== fileName) {
              fs.unlinkSync(cleanedFileName);
          }

          console.log(`Temporary audio files deleted.`);
      } catch (error) {
          console.error('Error in transcription flow:', error.message);
          await bot.sendMessage(userId, 'Failed to transcribe audio. Please try again.');
          return;
      }

  } else if (msg.audio || (msg.document && msg.document.mime_type.startsWith('audio/'))) {
      let fileId;
      let fileName;

      if (msg.audio) {
          console.log(`Audio file received from userId: ${userId}`);
          fileId = msg.audio.file_id;
          fileName = `${fileId}.${msg.audio.file_name.split('.').pop()}`;
      } else if (msg.document) {
          console.log(`Document containing audio received from userId: ${userId}`);
          fileId = msg.document.file_id;
          fileName = `${fileId}.${msg.document.file_name.split('.').pop()}`;
      }

      try {
          const filePath = await bot.getFileLink(fileId);
          const response = await axios({
              url: filePath,
              method: 'GET',
              responseType: 'stream'
          });
          const fileStream = fs.createWriteStream(fileName);
          response.data.pipe(fileStream);

          await new Promise((resolve, reject) => {
              fileStream.on('finish', resolve);
              fileStream.on('error', reject);
          });

          console.log(`Audio file download completed for ${fileName}`);

          // Conditionally clean the audio if caption contains 'filter'
          let cleanedFileName = fileName;
          if (msg.caption && msg.caption.toLowerCase() === 'filter') {
              console.log('Applying noise suppression with sh.rnnn model...');
              cleanedFileName = await cleanAudio(fileName);
          }

          // Transcription logic
          const languageIdentifier = constructLanguageIdentifier(user.language, user.location);
          const transcription = await transcribeAudio(cleanedFileName, languageIdentifier);

          if (transcription && transcription.text) {
              messageContent = transcription.text;
              console.log(`Transcription result: ${messageContent}`);
          } else {
              console.error('Transcription failed or returned no text.');
              await bot.sendMessage(userId, 'Failed to retrieve transcription text. Please try again.');
              return;
          }

          fs.unlinkSync(fileName);
          if (cleanedFileName !== fileName) {
              fs.unlinkSync(cleanedFileName);
          }

          console.log(`Temporary audio files deleted.`);
      } catch (error) {
          console.error('Error in processing audio file:', error.message);
          await bot.sendMessage(userId, 'Failed to process the audio file. Please try again.');
          return;
      }
  } else if (msg.document && !msg.document.mime_type.startsWith('audio/')) {
      await bot.sendDocument(user.connectedChatId, msg.document.file_id);
  }
  
  // Handle text messages
  if (messageContent || msg.text) {
      if (!user.language) {
          console.log(`User language not set for userId: ${userId}. Sending initial language menu.`);
          await sendInitialMenu(bot, userId);
          await bot.sendMessage(userId, 'Please select your language to start using the bot.');
          return;
      }

      const messageToTranslate = messageContent || msg.text;
      const targetUser = await User.findOne({ userId: user.connectedChatId });

      if (targetUser) {
          try {
              const conversation = await updateConversation(user, targetUser, messageToTranslate);
              const context = await analyzeContext(conversation.messages, user.language, user.dialect, user.location);
              const translatedText = await translateMessage(messageToTranslate, context, user, targetUser, conversation.messages);

              const savedMessage = await saveMessage(conversation._id.toString(), user._id.toString(), messageToTranslate, translatedText, user.dialect);
              const messageId = savedMessage._id.toString();
              console.log(`Message saved with messageId: ${messageId}`);

              await bot.sendMessage(targetUser.userId, translatedText, {
                  reply_markup: {
                      inline_keyboard: [
                          [{ text: 'See Original', callback_data: `see_original_${messageId}` }]
                      ]
                  }
              });
          } catch (error) {
              console.error(`Error processing message for userId ${userId}: ${error.message}`, error.stack);
              await bot.sendMessage(userId, 'Failed to process message. Please try again.');
          }
      } else {
          console.warn(`Target user not found for userId: ${user.connectedChatId}`);
          await bot.sendMessage(userId, 'The user you are trying to chat with is not available.');
      }
  }
}


async function updateConversation(user, targetUser, messageText) {
  const userObjectId = new ObjectId(user._id);
  const targetUserObjectId = new ObjectId(targetUser._id);

  let conversation = await Conversation.findOne({ users: { $all: [userObjectId, targetUserObjectId] } });
  const messageEntry = { sender: userObjectId, content: messageText };

  if (!conversation) {
    conversation = new Conversation({
      users: [userObjectId, targetUserObjectId],
      messages: [messageEntry],
      summary: '',
      lastUpdated: new Date()
    });
  } else {
    conversation.messages.push(messageEntry);
    if (conversation.messages.length > 5) {
      conversation.messages = conversation.messages.slice(-5); // Keep only the last 5 messages
    }
  }

  await conversation.save();
  return conversation;
}
async function getOriginalText(messageId, userId) {
  try {
    const message = await Message.findById(messageId).exec();
    if (!message) {
      logger.error(`Message with ID ${messageId} not found for userId ${userId}`);
      throw new Error(`Message with ID ${messageId} not found`);
    }

    return message.originalText;
  } catch (error) {
    logger.error(`Error retrieving original text for messageId ${messageId}: ${error.message}`);
    throw new Error(`Failed to retrieve original text for messageId ${messageId}`);
  }
}

async function getEnhancedText(messageId, userId) {
  try {
    const message = await Message.findById(messageId).exec();
    if (!message) {
      logger.error(`Message with ID ${messageId} not found`);
      throw new Error(`Message with ID ${messageId} not found`);
    }

    return message.translatedText;
  } catch (error) {
    logger.error(`Error retrieving enhanced text for messageId ${messageId}:`, error.message);
    throw new Error(`Failed to retrieve enhanced text for messageId ${messageId}`);
  }
}


async function getEnhancedText(messageId, userId) {
  try {
    const message = await Message.findById(messageId).exec();
    if (!message) {
      logger.error(`Message with ID ${messageId} not found`);
      throw new Error(`Message with ID ${messageId} not found`);
    }

    return message.translatedText;
  } catch (error) {
    logger.error(`Error retrieving enhanced text for messageId ${messageId}:`, error.message);
    throw new Error(`Failed to retrieve enhanced text for messageId ${messageId}`);
  }
}

async function sendInitialMenu(bot, chatId) {
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

async function getMessages(chatId) {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`, {
      params: {
        limit: 100 // Adjust as needed
      }
    });

    if (response.data.ok) {
      // sourcery skip: inline-immediately-returned-variable
      const messages = response.data.result
        .filter(update => update.message && update.message.chat && update.message.chat.id === chatId)
        .map(update => update.message.message_id);
      return messages;
    } else {
      logger.error('Error fetching messages:', response.data.description);
      return [];
    }
  } catch (error) {
    logger.error('Error fetching messages:', error.message, error.stack);
    return [];
  }
}

async function deleteMessages(bot, chatId, messages) {
  for (const messageId of messages) {
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (error) {
      logger.error(`Error deleting message with id ${messageId} for chatId ${chatId}:`, error.message, error.stack);
    }
  }
}

async function deleteAllMessagesBeforeLast(bot, chatId) {
  const messages = await getMessages(chatId);
  if (messages.length > 0) {
    const messagesToDelete = messages.slice(0, -1);
    await deleteMessages(bot, chatId, messagesToDelete);
  }
}

async function handleClearHistoryConfirmation(bot, chatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Yes, delete', callback_data: 'clear_history_yes' }],
        [{ text: 'No, don\'t delete', callback_data: 'clear_history_no' }]
      ]
    }
  };
  await bot.sendMessage(chatId, 'Do you want to clear the chat history?', options);
}

async function handleClearHistoryConfirmation(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const { data } = callbackQuery;

  const user = await User.findOne({ userId: chatId });
  if (!user) {
    return;
  }

  if (data === 'clear_history_yes') {
    const messages = await getMessages(chatId);
    if (messages.length > 0) {
      await deleteMessages(bot, chatId, messages);
    }
    await bot.sendMessage(chatId, 'Chat history cleared.');
  } else if (data === 'clear_history_no') {
    await bot.sendMessage(chatId, 'Chat history not cleared.');
  }

  await sendInitialMenu(bot, chatId);
}

  
async function handleCallbackQuery(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  switch (data) {
    case 'change_language':
      await handleStart(bot, callbackQuery.message);
      break;
    case 'override':
      await handleOverride(bot, chatId);
      break;
    case 'settings':
      await handleSettings(bot, chatId);
      break;
    case 'main_menu':
      await sendInitialMenu(bot, chatId);
      break;
    default:
      logger.warn(`Unhandled callback query data: ${data}`);
      break;
  }
}

async function handleRedoTranslation(bot, message) {
  const chatId = message.chat.id;
  const userId = message.chat.id;
  const userState = getState(userId);

  if (!userState || !userState.lastMessageWithButton) {
    await bot.sendMessage(chatId, 'No previous message to redo translation.');
    return;
  }

  const messages = await Message.find({ chatId }).sort({ timestamp: -1 }).limit(12).exec();
  const context = await analyzeContext(messages);

  const lastMessage = messages[0];
  const prompt = generateEnhancedPrompt(lastMessage.originalText, context, userId, userId);

  const translatedText = await translateMessage(prompt, context, userId, userId);
  await bot.sendMessage(chatId, `Redo translation: ${translatedText}`);
  await saveMessage(chatId, userId, lastMessage.originalText, translatedText);

  try {
    await bot.deleteMessage(chatId, userState.lastMessageWithButton + 1);
  } catch (error) {
    logger.error(`Error deleting "Please wait" message: ${error.message}`);
  }

  await sendMessageWithButtons(bot, chatId, translatedText);
}

async function handleExplainThis(bot, message) {
  const chatId = message.chat.id;
  const userId = message.chat.id;
  const userState = getState(userId);

  if (!userState || !userState.lastMessageWithButton) {
    await bot.sendMessage(chatId, 'No previous message to explain.');
    return;
  }

  const messages = await Message.find({ chatId }).sort({ timestamp: -1 }).limit(12).exec();
  const context = await analyzeContext(messages);

  const lastMessage = messages[0];
  const prompt = generateEnhancedPrompt(lastMessage.originalText, context, userId, userId);

  const explanation = await translateMessage(prompt, context, userId, userId);
  await bot.sendMessage(chatId, `Explanation: ${explanation}`);
  await saveMessage(chatId, userId, lastMessage.originalText, explanation);

  try {
    await bot.deleteMessage(chatId, userState.lastMessageWithButton + 1);
  } catch (error) {
    logger.error(`Error deleting "Please wait" message: ${error.message}`);
  }

  await sendMessageWithButtons(bot, chatId, explanation);
}

module.exports = {
  handleStart,
  handleCreateChat,
  handleJoinChat,
  handleEndChat,
  handleKillChat,
  handleMessage,
  handleCallbackQuery,
  handleSettings,
  handleOverride,
  sendInitialMenu,
  handleRedoTranslation,
  getOriginalText,
  getEnhancedText,
  handleExplainThis,
  handleRegionChange,
  deleteCurrentMessage,
  getCurrentMessageId,
  handleLanguageSelection,
  handleDialectChange
};