const User = require('../models/User');
const Message = require('../models/Message');
const logger = require('../logger');
const colors = require('./colors');
const { translateMessage, analyzeContext, transcribeAudio, constructLanguageIdentifier, cleanAudio } = require('./azureService');
const { updateConversation } = require('./conversationHandler');
const { saveMessage } = require('./messageService');
const { logMessage } = require('../messageUtils');
const { sendInitialMenu } = require('./menuHandler');
const { getState, setState } = require('./stateManager');
const { handleSupportResponse } = require('./supportHandler');
const { endAIChat } = require('./aiChatHandler'); // Import the endAIChat function
const { handleAIChatMessage } = require('./aiChatHandler');
const fs = require('fs');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function handleMessage(bot, msg) {
  const userId = msg.chat.id;
  const userState = getState(userId);

  if (userState && userState.inOverrideProcess) {
    // If the user is in the override process, don't handle the message here
    return;
  }

  if (userState && userState.inAIChat) {
    const user = await User.findOne({ userId: userId });
    if (!user) {
      console.warn(`User not found for userId: ${userId}`);
      await bot.sendMessage(userId, 'User not found. Please start the bot again with /start.');
      return;
    }
    await handleAIChatMessage(bot, msg, user);
    return;
  }

  const user = await User.findOne({ userId: userId });

  if (!user) {
    console.warn(`User not found for userId: ${userId}`);
    await bot.sendMessage(userId, 'User not found. Please start the bot again with /start.');
    return;
  }

  if (userState && userState.awaitingSupportResponse) {
    await handleSupportResponse(bot, msg, user);
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
      
    if (!user.connectedChatId) {
      if (msg.text === '/start') {
        return;
      } else {
          console.warn(`User ${userId} is not in a chat.`);
          await bot.sendMessage(userId, 'You are not currently in a chat. Please join or create a chat first.');
          return;
      }
    }

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

module.exports = {
  handleMessage,
  handleMessages,
  handleRedoTranslation,
  handleExplainThis,
  deleteCurrentMessage,
  getCurrentMessageId
};