const User = require('../models/User');
const { handleSettings, deleteSettingsMenu } = require('./menuHandler');
const { colorLog } = require('./colorLogger');
const { getState, setState } = require('./stateManager');

async function handleOverride(bot, chatId) {
	await deleteSettingsMenu(bot, chatId);
	
	let attempts = 0;
	const maxAttempts = 3;

	const promptForCode = async () => {
		const options = {
			reply_markup: {
				inline_keyboard: [
					[{ text: 'Go Back', callback_data: 'settings_go_back' }]
				]
			},
			parse_mode: 'Markdown'
		};
		const message = await bot.sendMessage(chatId, `Enter authorization code (Attempt ${attempts + 1}/${maxAttempts}):`, options);
		setState(chatId, { overridePromptMessageId: message.message_id, inOverrideProcess: true });
	};

	await promptForCode();

	const handleAttempt = async (msg) => {
		const authCode = msg.text;
		attempts++;

		try {
			await bot.deleteMessage(chatId, msg.message_id);
		} catch (error) {
			colorLog('ERROR', `User${chatId}`, `Failed to delete user's code message: ${error.message}`);
		}

		if (authCode === process.env.OVERRIDE_AUTH_CODE) {
  			try {
  				await bot.deleteMessage(chatId, getState(chatId).overridePromptMessageId);
  			} catch (error) {
  				colorLog('ERROR', `User${chatId}`, `Failed to delete override prompt: ${error.message}`);
  			}
  			const successMessage = await bot.sendMessage(chatId, 'Authorization successful ✅');
  			setTimeout(async () => {
  				try {
  					await bot.deleteMessage(chatId, successMessage.message_id);
  				} catch (error) {
  					colorLog('ERROR', `User${chatId}`, `Failed to delete success message: ${error.message}`);
  				}
  				setState(chatId, { inOverrideProcess: false });
  				await handleCustomLanguageInput(bot, chatId);
  			}, 1200);
  		}
  else if (attempts < maxAttempts) {
  				try {
  					await bot.editMessageText(`Invalid code. Please try again. (Attempt ${attempts + 1}/${maxAttempts})`, {
  						chat_id: chatId,
  						message_id: getState(chatId).overridePromptMessageId,
  						reply_markup: {
  							inline_keyboard: [
  								[{ text: 'Go Back', callback_data: 'settings_go_back' }]
  							]
  						}
  					});
  					bot.once('message', handleAttempt);
  				} catch (error) {
  					colorLog('ERROR', `User${chatId}`, `Failed to edit override prompt: ${error.message}`);
  					// If editing fails, send a new message
  					await promptForCode();
  				}
  			}
  else {
  				try {
  					await bot.deleteMessage(chatId, getState(chatId).overridePromptMessageId);
  				} catch (error) {
  					colorLog('ERROR', `User${chatId}`, `Failed to delete override prompt: ${error.message}`);
  				}
  				const maxAttemptsMessage = await bot.sendMessage(chatId, 'Maximum attempts reached ❌');
  				setTimeout(async () => {
  					try {
  						await bot.deleteMessage(chatId, maxAttemptsMessage.message_id);
  					} catch (error) {
  						colorLog('ERROR', `User${chatId}`, `Failed to delete max attempts message: ${error.message}`);
  					}
  					setState(chatId, { inOverrideProcess: false });
  					await handleSettings(bot, chatId);
  				}, 1200);
  				bot.removeListener('message', handleAttempt);
  			}
	};

	bot.once('message', handleAttempt);
}

async function handleCustomLanguageInput(bot, chatId) {
	await bot.sendMessage(chatId, 'Enter custom language:');
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
				logger.info(`${colors.green}Custom language and dialect set for userId=${chatId}: ${customLanguage} - ${customDialect}${colors.reset}`);
				const successMessage = await bot.sendMessage(chatId, `Custom language and dialect set to: ${customLanguage} - ${customDialect} ✅`);
				setTimeout(async () => {
					await bot.deleteMessage(chatId, successMessage.message_id);
					await handleSettings(bot, chatId);
				}, 1200);
			} else {
				logger.warn(`${colors.yellow}User not found for userId=${chatId} during override${colors.reset}`);
				await bot.sendMessage(chatId, 'User not found. Please try again.');
				await handleSettings(bot, chatId);
			}
		});
	});
}

module.exports = { handleOverride };