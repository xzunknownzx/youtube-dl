const axios = require('axios');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { translateMessage, analyzeContext, generateEnhancedPrompt } = require('./azureService');
const { saveMessage } = require('./messageService');
const logger = require('../logger');
require('dotenv').config();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const { deleteAllMessagesInChat, logMessage } = require('../messageUtils'); // Import the new function

function escapeMarkdown(text) {
  return text.replace(/([_*\[\]()~`>#+-=|{}.!])/g, '\\$1');
}

async function handleStart(bot, msg) {
  if (!msg || !msg.chat || !msg.chat.id) {
    logger.error('Invalid message object received in handleStart', msg);
    return;
  }

  const chatId = msg.chat.id;
  logger.info(`Received /start command from chatId=${chatId}`);

  let user;
  try {
    user = await User.findOne({ userId: chatId });
  } catch (error) {
    logger.error(`Error finding user for chatId=${chatId}`, error.message);
  }

  if (user) {
    logger.info(`User found for chatId=${chatId}`);

    if (user.connectedChatId) {
      logger.info(`User is currently in a chat with connectedChatId=${user.connectedChatId}`);
      await bot.sendMessage(chatId, `You are currently in a chat. Please end the current chat before starting a new one.`);
      return;
    } else {
      logger.info(`User is not currently in a chat. Proceeding with start command.`);
    }
  } else {
    logger.info(`User not found for chatId=${chatId}. Creating new user entry.`);
    const telegramName = msg.chat.username || msg.from.first_name || 'User';
    const newUser = new User({ userId: chatId, telegramName });
    try {
      await newUser.save();
      logger.info(`New user created with chatId=${chatId}`);
    } catch (error) {
      logger.error(`Error creating new user with chatId=${chatId}`, error.message);
    }
  }

  logger.info(`Starting handleStart for chatId=${chatId}`);
  await bot.sendMessage(chatId, 'Welcome! Select your language:');

  const removeButtonOptions = {
    reply_markup: {
      remove_keyboard: true
    }
  };
  logger.info('Removing the Start button.');
  const removeMsg = await bot.sendMessage(chatId, 'Please wait...', removeButtonOptions);
  await logMessage(chatId, removeMsg.message_id, 'bot', 'Please wait...');

  await new Promise(resolve => setTimeout(resolve, 2000));
  try {
    await bot.deleteMessage(chatId, msg.message_id);
    await logMessage(chatId, msg.message_id, 'deleted', '');
  } catch (error) {
    logger.error(`Error deleting message with id=${msg.message_id}`, error.message);
  }

  try {
    await bot.deleteMessage(chatId, msg.message_id + 1);
    await logMessage(chatId, msg.message_id + 1, 'deleted', '');
  } catch (error) {
    logger.error(`Error deleting message with id=${msg.message_id + 1}`, error.message);
  }

  try {
    await bot.deleteMessage(chatId, msg.message_id + 2);
    await logMessage(chatId, msg.message_id + 2, 'deleted', '');
  } catch (error) {
    logger.error(`Error deleting message with id=${msg.message_id + 2}`, error.message);
  }

  const languageOptions = {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: 'English', callback_data: 'lang_en' }, { text: 'Spanish', callback_data: 'lang_es' }, { text: 'Russian', callback_data: 'lang_ru' }, { text: 'Chinese', callback_data: 'lang_zh' }],
        [{ text: 'French', callback_data: 'lang_fr' }, { text: 'Japanese', callback_data: 'lang_ja' }, { text: 'Farsi', callback_data: 'lang_fa' }, { text: 'German', callback_data: 'lang_de' }],
        [{ text: 'Bamileke', callback_data: 'lang_bam' }, { text: 'Arabic', callback_data: 'lang_ar' }, { text: 'Portuguese', callback_data: 'lang_pt' }, { text: 'Italian', callback_data: 'lang_it' }],
        [{ text: 'Bengali', callback_data: 'lang_bn' }, { text: 'Hindi', callback_data: 'lang_hi' }, { text: 'Urdu', callback_data: 'lang_ur' }, { text: 'Punjabi', callback_data: 'lang_pa' }],
        [{ text: 'Vietnamese', callback_data: 'lang_vi' }, { text: 'Yoruba', callback_data: 'lang_yo' }, { text: 'Amazigh', callback_data: 'lang_amz' }]
      ]
    }),
    parse_mode: 'Markdown'
  };
logger.info('Sending language selection menu.');
const langMsg = await bot.sendMessage(chatId, 'Select your language:', languageOptions);
await logMessage(chatId, langMsg.message_id, 'bot', 'Select your language:');
}

async function handleLanguageChange(bot, message, language) {
  const userId = message.chat.id;
  const telegramName = message.chat.username || message.from.first_name || 'User';
  logger.info(`Language change initiated for chatId=${userId}, language=${language}`, message);

  try {
    let user = await User.findOne({ userId: userId });
    if (!user) {
      user = new User({ userId, language, telegramName });
    } else {
      user.language = language;
      user.telegramName = telegramName;
    }
    await user.save();
    logger.info(`Language set to ${language} for userId=${userId}`);

    await handleRegionSelection(bot, message, language);

  } catch (error) {
    console.error('Error setting language:', error.message, error.stack);
    logger.error(`Error setting language for userId=${userId}:`, error.message, error.stack);
    await bot.sendMessage(message.chat.id, 'Failed to set language.');
  }
}

async function handleRegionSelection(bot, message, language) {
  logger.info(`Region selection initiated for chatId=${message.chat.id}, language=${language}`, message);

  const regions = {
    'lang_en': ['US', 'UK', 'Australia'],
    'lang_es': ['Spain', 'Mexico', 'Argentina'],
    'lang_ru': ['Russia', 'Ukraine', 'Kazakhstan'],
    'lang_zh': ['China', 'Taiwan', 'Singapore'],
    'lang_fr': ['France', 'Canada', 'Belgium', 'Algeria'],
    'lang_ja': ['Japan'],
    'lang_fa': ['Iran', 'Afghanistan', 'Tajikistan'],
    'lang_de': ['Germany', 'Austria', 'Switzerland'],
    'lang_bam': ['Cameroon'],
    'lang_ar': ['Algeria (Darija)', 'Morocco (Darija)', 'Tunisia (Darija)', 'Egyptian', 'Levantine'],
    'lang_pt': ['Portugal', 'Brazil'],
    'lang_it': ['Italy', 'Switzerland'],
    'lang_bn': ['Bangladesh', 'West Bengal', 'Dhaka', 'Chittagong', 'Sylhet', 'Rangpur'],
    'lang_hi': ['Standard Hindi', 'Bhojpuri', 'Awadhi', 'Braj', 'Haryanvi', 'Rajasthani'],
    'lang_ur': ['Pakistan', 'India', 'Dakhini', 'Rekhta', 'Hyderabadi'],
    'lang_pa': ['Eastern (India)', 'Western (Pakistan)', 'Majhi', 'Doabi', 'Malwai', 'Pothwari'],
    'lang_vi': ['Northern', 'North-Central', 'Central', 'Southern', 'Hue', 'Hanoi', 'Saigon'],
    'lang_yo': ['Standard Yoruba', 'Oyo', 'Ibadan', 'Ijebu', 'Ekiti', 'Ife', 'Ondo', 'Owo', 'Ijesa'],
    'lang_amz': ['Tamazight', 'Tashelhit', 'Tarifit', 'Kabyle', 'Chaoui', 'Tuareg', 'Zenaga']
  };

  const dialects = {
    'US': 'en_us',
    'UK': 'en_uk',
    'Australia': 'en_au',
    'Spain': 'es_es',
    'Mexico': 'es_mx',
    'Argentina': 'es_ar',
    'Russia': 'ru_ru',
    'Ukraine': 'ru_ua',
    'Kazakhstan': 'ru_kz',
    'China': 'zh_cn',
    'Taiwan': 'zh_tw',
    'Singapore': 'zh_sg',
    'France': 'fr_fr',
    'Canada': 'fr_ca',
    'Belgium': 'fr_be',
    'Algeria': 'fr_dz',
    'Japan': 'ja_jp',
    'Iran': 'fa_ir',
    'Afghanistan': 'fa_af',
    'Tajikistan': 'fa_tj',
    'Germany': 'de_de',
    'Austria': 'de_at',
    'Switzerland': 'de_ch',
    'Cameroon': 'bam_cm',
    'Algeria (Darija)': 'ar_darija_dz',
    'Morocco (Darija)': 'ar_darija_ma',
    'Tunisia (Darija)': 'ar_darija_tn',
    'Egyptian': 'ar_eg',
    'Levantine': 'ar_levant',
    'Portugal': 'pt_pt',
    'Brazil': 'pt_br',
    'Italy': 'it_it',
    'Switzerland': 'it_ch',
    'Bangladesh': 'bn_bd',
    'West Bengal': 'bn_in',
    'Dhaka': 'bn_dhaka',
    'Chittagong': 'bn_ctg',
    'Sylhet': 'bn_syl',
    'Rangpur': 'bn_rng',
    'Standard Hindi': 'hi_std',
    'Bhojpuri': 'hi_bhoj',
    'Awadhi': 'hi_awa',
    'Braj': 'hi_braj',
    'Haryanvi': 'hi_har',
    'Rajasthani': 'hi_raj',
    'Pakistan': 'ur_pk',
    'India': 'ur_in',
    'Dakhini': 'ur_dak',
    'Rekhta': 'ur_rek',
    'Hyderabadi': 'ur_hyd',
    'Eastern (India)': 'pa_in',
    'Western (Pakistan)': 'pa_pk',
    'Majhi': 'pa_maj',
    'Doabi': 'pa_doa',
    'Malwai': 'pa_mal',
    'Pothwari': 'pa_pot',
    'Northern': 'vi_north',
    'North-Central': 'vi_ncentral',
    'Central': 'vi_central',
    'Southern': 'vi_south',
    'Hue': 'vi_hue',
    'Hanoi': 'vi_hanoi',
    'Saigon': 'vi_saigon',
    'Standard Yoruba': 'yo_std',
    'Oyo': 'yo_oyo',
    'Ibadan': 'yo_iba',
    'Ijebu': 'yo_ije',
    'Ekiti': 'yo_eki',
    'Ife': 'yo_ife',
    'Ondo': 'yo_ond',
    'Owo': 'yo_owo',
    'Ijesa': 'yo_ije',
    'Tamazight': 'amz_tamazight',
    'Tashelhit': 'amz_tashelhit',
    'Tarifit': 'amz_tarifit',
    'Kabyle': 'amz_kabyle',
    'Chaoui': 'amz_chaoui',
    'Tuareg': 'amz_tuareg',
    'Zenaga': 'amz_zenaga'
  };

  const regionOptions = regions[`lang_${language}`].map(region => ({
    text: region, callback_data: `region_${dialects[region] || region}`
  }));

  const options = {
    reply_markup: JSON.stringify({
      inline_keyboard: regionOptions.map(option => [option])
    }),
    parse_mode: 'Markdown'
  };

  await bot.editMessageText('Select your country/region:', {
    chat_id: message.chat.id,
    message_id: message.message_id,
    reply_markup: options.reply_markup
  });
}

async function handleRegionChange(bot, message, region) {
  const userId = message.chat.id;
  logger.info(`Region change initiated for chatId=${userId}, region=${region}`, message);

  const dialectMapping = {
    'US': 'en_us',
    'UK': 'en_uk',
    'Australia': 'en_au',
    'Spain': 'es_es',
    'Mexico': 'es_mx',
    'Argentina': 'es_ar',
    'Russia': 'ru_ru',
    'Ukraine': 'ru_ua',
    'Kazakhstan': 'ru_kz',
    'China': 'zh_cn',
    'Taiwan': 'zh_tw',
    'Singapore': 'zh_sg',
    'France': 'fr_fr',
    'Canada': 'fr_ca',
    'Belgium': 'fr_be',
    'Algeria': 'fr_dz',
    'Japan': 'ja_jp',
    'Iran': 'fa_ir',
    'Afghanistan': 'fa_af',
    'Tajikistan': 'fa_tj',
    'Germany': 'de_de',
    'Austria': 'de_at',
    'Switzerland': 'de_ch',
    'Cameroon': 'bam_cm',
    'Algeria (Darija)': 'ar_darija_dz',
    'Morocco (Darija)': 'ar_darija_ma',
    'Tunisia (Darija)': 'ar_darija_tn',
    'Egyptian': 'ar_eg',
    'Levantine': 'ar_levant',
    'Portugal': 'pt_pt',
    'Brazil': 'pt_br',
    'Italy': 'it_it',
    'Switzerland': 'it_ch',
    'Bangladesh': 'bn_bd',
    'West Bengal': 'bn_in',
    'Dhaka': 'bn_dhaka',
    'Chittagong': 'bn_ctg',
    'Sylhet': 'bn_syl',
    'Rangpur': 'bn_rng',
    'Standard Hindi': 'hi_std',
    'Bhojpuri': 'hi_bhoj',
    'Awadhi': 'hi_awa',
    'Braj': 'hi_braj',
    'Haryanvi': 'hi_har',
    'Rajasthani': 'hi_raj',
    'Pakistan': 'ur_pk',
    'India': 'ur_in',
    'Dakhini': 'ur_dak',
    'Rekhta': 'ur_rek',
    'Hyderabadi': 'ur_hyd',
    'Eastern (India)': 'pa_in',
    'Western (Pakistan)': 'pa_pk',
    'Majhi': 'pa_maj',
    'Doabi': 'pa_doa',
    'Malwai': 'pa_mal',
    'Pothwari': 'pa_pot',
    'Northern': 'vi_north',
    'North-Central': 'vi_ncentral',
    'Central': 'vi_central',
    'Southern': 'vi_south',
    'Hue': 'vi_hue',
    'Hanoi': 'vi_hanoi',
    'Saigon': 'vi_saigon',
    'Standard Yoruba': 'yo_std',
    'Oyo': 'yo_oyo',
    'Ibadan': 'yo_iba',
    'Ijebu': 'yo_ije',
    'Ekiti': 'yo_eki',
    'Ife': 'yo_ife',
    'Ondo': 'yo_ond',
    'Owo': 'yo_owo',
    'Ijesa': 'yo_ije',
    'Tamazight': 'amz_tamazight',
    'Tashelhit': 'amz_tashelhit',
    'Tarifit': 'amz_tarifit',
    'Kabyle': 'amz_kabyle',
    'Chaoui': 'amz_chaoui',
    'Tuareg': 'amz_tuareg',
    'Zenaga': 'amz_zenaga'
  };

  try {
    let user = await User.findOne({ userId: userId });
    if (user) {
      user.location = region;
      user.dialect = dialectMapping[region] || `${user.language}-${region}`;
      await user.save();
      logger.info(`Region set to ${region} for userId=${userId}`);

      // Edit the current message to remove the region selection
      await bot.editMessageText('Region selected.', {
        chat_id: message.chat.id,
        message_id: message.message_id
      });

      // Send the main menu
      await sendInitialMenu(bot, userId);
    } else {
      await bot.sendMessage(userId, 'User not found.');
    }
  } catch (error) {
    logger.error(`Error setting region for userId=${userId}`, error.message);
    await bot.sendMessage(userId, 'Failed to set region.');
  }
}

async function sendInitialMenu(bot, chatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Join Chat', callback_data: 'join_chat' }, { text: 'Create Chat', callback_data: 'create_chat' }],
        [{ text: 'Export History', callback_data: 'export_history' }, { text: 'Clear History', callback_data: 'clear_history' }],
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

async function handleCreateChat(bot, message) {
  const connectionCode = Math.random().toString(36).substr(2, 9).toUpperCase();
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

  await bot.sendMessage(message.chat.id, `Your connection code is: ${connectionCode}`);
}

async function handleJoinChat(bot, message) {
  logger.info(`Handling join chat for chatId: ${message.chat.id}`);
  const sentMessage = await bot.editMessageText('Please enter the connection code:', {
    chat_id: message.chat.id,
    message_id: message.message_id
  });

  await User.updateOne({ userId: message.chat.id }, { message_id: sentMessage.message_id });

  bot.once('message', async (msg) => {
    const enteredCode = msg.text.toUpperCase();
    logger.info(`Received connection code: ${enteredCode} for chatId: ${message.chat.id}`);

    const joinRequestingUser = await User.findOne({ userId: message.chat.id });
    const userToConnect = await User.findOne({ connectionCode: enteredCode, connectionCodeExpiry: { $gte: new Date() } });

    if (joinRequestingUser) {
      logger.info(`Join requesting user found: ${JSON.stringify(joinRequestingUser)}`);
    } else {
      logger.warn(`Join requesting user not found for chatId: ${message.chat.id}`);
    }

    if (userToConnect) {
      logger.info(`User to connect found: ${JSON.stringify(userToConnect)}`);
      await User.updateOne({ userId: msg.chat.id }, { connectedChatId: userToConnect.userId, connectionCode: null, connectionCodeExpiry: null });
      await User.updateOne({ userId: userToConnect.userId }, { connectedChatId: msg.chat.id, connectionCode: null, connectionCodeExpiry: null });

      const newOptions = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'End Chat', callback_data: 'end_chat', color: 'red' }],
            [{ text: 'Settings', callback_data: 'settings' }, { text: 'Support', callback_data: 'support' }]
          ]
        },
        parse_mode: 'Markdown'
      };

      const escapedUsername1 = escapeMarkdown(userToConnect.telegramName);
      const escapedUsername2 = escapeMarkdown(joinRequestingUser.telegramName);

      const newMessage1 = await bot.sendMessage(msg.chat.id, `Connected to chat with user: @${escapedUsername1}`, newOptions);
      const newMessage2 = await bot.sendMessage(userToConnect.userId, `Connected to chat with user: @${escapedUsername2}`, newOptions);

      await User.updateOne({ userId: msg.chat.id }, { message_id: newMessage1.message_id });
      await User.updateOne({ userId: userToConnect.userId }, { message_id: newMessage2.message_id });

      logger.info(`Users connected: ${msg.chat.id} and ${userToConnect.userId}`);
    } else {
      await bot.sendMessage(msg.chat.id, 'Invalid or expired connection code. Please try again.');
      logger.warn(`Invalid or expired connection code: ${enteredCode} for chatId: ${message.chat.id}`);
    }
  });
}

async function handleKillChat(bot, msg) {
  try {
    const user = await User.findOne({ userId: msg.chat.id });
    if (user && user.connectedChatId) {
      const connectedUser = await User.findOne({ userId: user.connectedChatId });
      if (connectedUser) {
        await User.updateOne({ userId: connectedUser.userId }, { connectedChatId: null });
        await bot.sendMessage(connectedUser.userId, 'The chat has been forcibly ended by the other user.');
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

      const options = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Join Chat', callback_data: 'join_chat' }, { text: 'Create Chat', callback_data: 'create_chat' }],
            [{ text: 'Export History', callback_data: 'export_history' }, { text: 'Clear History', callback_data: 'clear_history' }],
            [{ text: 'Settings', callback_data: 'settings' }, { text: 'Support', callback_data: 'support' }]
          ]
        },
        parse_mode: 'Markdown'
      };

      try {
        await bot.editMessageText('How can I assist you further?', {
          chat_id: msg.chat.id,
          message_id: msg.message_id,
          reply_markup: options.reply_markup
        });
      } catch (error) {
        if (error.response && error.response.body && error.response.body.error_code === 400) {
          console.warn('Message to edit not found. Sending a new message instead.');
          await bot.sendMessage(msg.chat.id, 'How can I assist you further?', { reply_markup: options.reply_markup });
        } else {
          throw error;
        }
      }
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

const userMessageQueues = {};
const userProcessing = {};

async function processMessageQueue(userId) {
  if (userProcessing[userId]) return;

  userProcessing[userId] = true;

  while (userMessageQueues[userId] && userMessageQueues[userId].length > 0) {
    const { bot, msg } = userMessageQueues[userId].shift();
    await handleMessageLogic(bot, msg);
  }

  userProcessing[userId] = false;
}

async function handleMessage(bot, msg) {
  const userId = msg.chat.id;

  if (msg.entities && msg.entities.some(entity => entity.type === 'bot_command')) {
    logger.info(`Ignoring bot command in handleMessage for chatId: ${userId}`, msg.text);
    return;
  }

  logger.info(`Received message from chatId: ${userId}`, msg);

  if (!userMessageQueues[userId]) {
    userMessageQueues[userId] = [];
  }

  userMessageQueues[userId].push({ bot, msg });

  if (!userProcessing[userId]) {
    await processMessageQueue(userId);
  }
}

async function handleMessageLogic(bot, msg) {
  const userId = msg.chat.id;
  const user = await User.findOne({ userId: userId });

  if (user) {
    if (user.connectedChatId) {
      const targetUser = await User.findOne({ userId: user.connectedChatId });
      if (targetUser) {
        try {
          const conversation = await updateConversation(user, targetUser, msg.text);
          const context = await analyzeContext(conversation.messages);
          const translatedText = await translateMessage(msg.text, context, user, targetUser, conversation.messages);

          await bot.sendMessage(targetUser.userId, translatedText);
          await saveMessage(user.connectedChatId, msg.chat.id, msg.text, translatedText);
        } catch (error) {
          logger.error(`Error processing message for chatId ${msg.chat.id}: ${error.message}`, error.stack);
          await bot.sendMessage(msg.chat.id, 'Failed to translate message. Please try again.');
        }
      } else {
        await bot.sendMessage(msg.chat.id, 'The user you are trying to chat with is not available.');
      }
    } else {
      await bot.sendMessage(msg.chat.id, 'You are not connected to a chat.');
    }
  } else {
    await bot.sendMessage(msg.chat.id, 'User not found.');
  }
}


async function updateConversation(user, targetUser, messageText) {
  const userObjectId = new mongoose.Types.ObjectId(user._id);
  const targetUserObjectId = new mongoose.Types.ObjectId(targetUser._id);

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


// Send initial menu to the user
async function sendInitialMenu(bot, chatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Join Chat', callback_data: 'join_chat' }, { text: 'Create Chat', callback_data: 'create_chat' }],
        [{ text: 'Export History', callback_data: 'export_history' }, { text: 'Clear History', callback_data: 'clear_history' }],
        [{ text: 'Settings', callback_data: 'settings' }, { text: 'Support', callback_data: 'support' }]
      ]
    },
    parse_mode: 'Markdown'
  };
  await bot.sendMessage(chatId, 'How can I assist you further?', options);
}

// Function to get all messages for a chat
async function getMessages(chatId) {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`, {
      params: {
        limit: 100 // Adjust as needed
      }
    });

    if (response.data.ok) {
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

// Function to delete messages for a chat
async function deleteMessages(bot, chatId, messages) {
  for (const messageId of messages) {
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (error) {
      logger.error(`Error deleting message with id ${messageId} for chatId ${chatId}:`, error.message, error.stack);
    }
  }
}

// Function to delete all messages before the last message sent
async function deleteAllMessagesBeforeLast(bot, chatId) {
  const messages = await getMessages(chatId);
  if (messages.length > 0) {
    // Remove the last message from the array
    const messagesToDelete = messages.slice(0, -1);
    await deleteMessages(bot, chatId, messagesToDelete);
  }
}

// Send Yes/No confirmation for clearing chat history
async function sendClearHistoryConfirmation(bot, chatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Yes, delete', callback_data: 'clear_history_yes' }],
        [{ text: 'No, don’t delete', callback_data: 'clear_history_no' }]
      ]
    }
  };
  await bot.sendMessage(chatId, 'Do you want to clear the chat history?', options);
}

// Handle user response to clear history confirmation
async function handleClearHistoryConfirmation(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  const user = await User.findOne({ userId: chatId });
  if (!user) return;

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

// End chat and ask for clear history confirmation
async function handleEndChat(bot, message) {
  try {
    const user = await User.findOne({ userId: message.chat.id });
    if (user && user.connectedChatId) {
      const connectedUser = await User.findOne({ userId: user.connectedChatId });
      if (connectedUser) {
        await connectedUser.updateOne({ connectedChatId: "", connectionCode: "", connectionCodeExpiry: null });
        await bot.sendMessage(connectedUser.userId, 'The chat has been ended by the other user.');
        // await sendClearHistoryConfirmation(bot, connectedUser.userId);
      }

      await user.updateOne({ connectedChatId: "", connectionCode: "", connectionCodeExpiry: "" });
      await bot.sendMessage(message.chat.id, 'You have successfully ended the chat.');
      await sendClearHistoryConfirmation(bot, message.chat.id);

      logger.info(`Chat ended between users: ${message.chat.id} and ${connectedUser.userId}`);
    } else {
      await bot.sendMessage(message.chat.id, 'You are not currently in a chat.');
      logger.warn(`End chat attempted but no active chat found for userId: ${message.chat.id}`);
    }
  } catch (error) {
    logger.error('Error ending chat:', error.message, error.stack);
    await bot.sendMessage(message.chat.id, 'Failed to end chat.');
  }
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

// Handle "Redo Translation" button press
async function handleRedoTranslation(bot, message) {
  const chatId = message.chat.id;
  const userId = message.chat.id;
  const userState = getState(userId);

  if (!userState || !userState.lastMessageWithButton) {
    await bot.sendMessage(chatId, 'No previous message to redo translation.');
    return;
  }

  // Fetch the last 12 messages
  const messages = await Message.find({ chatId }).sort({ timestamp: -1 }).limit(12).exec();
  const context = await analyzeContext(messages);

  const lastMessage = messages[0];
  const prompt = generateEnhancedPrompt(lastMessage.originalText, context, userId, userId);

  const translatedText = await translateMessage(prompt, context, userId, userId);
  await bot.sendMessage(chatId, `Redo translation: ${translatedText}`);
  await saveMessage(chatId, userId, lastMessage.originalText, translatedText);

  // Remove the "Please wait" message
  try {
    await bot.deleteMessage(chatId, userState.lastMessageWithButton + 1);
  } catch (error) {
    logger.error(`Error deleting "Please wait" message: ${error.message}`);
  }

  await sendMessageWithButtons(bot, chatId, translatedText); // Send the new message with buttons
}

// Handle "Explain This" button press
async function handleExplainThis(bot, message) {
  const chatId = message.chat.id;
  const userId = message.chat.id;
  const userState = getState(userId);

  if (!userState || !userState.lastMessageWithButton) {
    await bot.sendMessage(chatId, 'No previous message to explain.');
    return;
  }

  // Fetch the last 12 messages
  const messages = await Message.find({ chatId }).sort({ timestamp: -1 }).limit(12).exec();
  const context = await analyzeContext(messages);

  const lastMessage = messages[0];
  const prompt = generateEnhancedPrompt(lastMessage.originalText, context, userId, userId);

  const explanation = await translateMessage(prompt, context, userId, userId);
  await bot.sendMessage(chatId, `Explanation: ${explanation}`);
  await saveMessage(chatId, userId, lastMessage.originalText, explanation);

  // Remove the "Please wait" message
  try {
    await bot.deleteMessage(chatId, userState.lastMessageWithButton + 1);
  } catch (error) {
    logger.error(`Error deleting "Please wait" message: ${error.message}`);
  }

  await sendMessageWithButtons(bot, chatId, explanation); // Send the new message with buttons
}

module.exports = {
  handleStart,
  handleLanguageChange,
  handleRegionSelection,
  handleRegionChange,
  handleCreateChat,
  handleJoinChat,
  handleEndChat,
  handleClearHistoryConfirmation,
  handleKillChat,
  handleMessage,
  deleteAllMessagesInChat,
  handleCallbackQuery,
  handleSettings,
  handleOverride,
  sendInitialMenu,
  handleRedoTranslation,
  handleExplainThis,
};