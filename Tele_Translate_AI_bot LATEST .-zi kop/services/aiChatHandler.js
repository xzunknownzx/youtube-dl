const { getState, setState } = require('./stateManager');
const { handleAIConversation } = require('./azureService');
const { saveMessage } = require('./messageService');
const logger = require('../logger');
const colors = require('./colors');
const { AzureOpenAI } = require("openai");

const MAX_AUTH_ATTEMPTS = 3;
const MAX_CONTEXT_MESSAGES = 10;

// Initialize the AzureOpenAI client
const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
});

async function startAIChat(bot, chatId) {
    logger.info(`${colors.blue}Starting AI Chat for chatId=${chatId}${colors.reset}`);
    setState(chatId, { aiChatAttempts: 0, inAIChat: false });
    await promptForAuthCode(bot, chatId);
}

async function promptForAuthCode(bot, chatId) {
    const userState = getState(chatId);
    const attempts = userState.aiChatAttempts || 0;

    if (attempts >= MAX_AUTH_ATTEMPTS) {
        await handleMaxAttemptsReached(bot, chatId);
        return;
    }

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Go Back', callback_data: 'ai_chat_go_back' }]
            ]
        }
    };

    const message = await bot.sendMessage(
        chatId, 
        `Please enter the authorization code for AI Chat (Attempt ${attempts + 1}/${MAX_AUTH_ATTEMPTS}):`,
        options
    );

    setState(chatId, { 
        aiChatPromptMessageId: message.message_id, 
        aiChatAttempts: attempts + 1,
        awaitingAIAuthCode: true
    });
}

async function handleAuthCode(bot, msg) {
    const chatId = msg.chat.id;
    const authCode = msg.text;
    const userState = getState(chatId);

    // Delete user's message containing the auth code
    await bot.deleteMessage(chatId, msg.message_id);

    if (authCode === process.env.AI_CHAT_AUTH_CODE) {
        await handleSuccessfulAuth(bot, chatId);
    } else {
        await handleFailedAuth(bot, chatId);
    }
}

async function handleSuccessfulAuth(bot, chatId) {
    const userState = getState(chatId);
    
    // Delete the prompt message
    if (userState.aiChatPromptMessageId) {
        await bot.deleteMessage(chatId, userState.aiChatPromptMessageId);
    }

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'End Chat', callback_data: 'end_ai_chat' }]
            ]
        }
    };

    const sentMessage = await bot.sendMessage(chatId, 'AI Chat started. How can I assist you?', options);
    setState(chatId, { 
        aiChatMessageId: sentMessage.message_id, 
        inAIChat: true,
        awaitingAIAuthCode: false,
        aiChatPromptMessageId: null
    });
}

async function handleFailedAuth(bot, chatId) {
    const userState = getState(chatId);
    
    if (userState.aiChatAttempts >= MAX_AUTH_ATTEMPTS) {
        await handleMaxAttemptsReached(bot, chatId);
    } else {
        await promptForAuthCode(bot, chatId);
    }
}

async function handleMaxAttemptsReached(bot, chatId) {
    const userState = getState(chatId);
    
    // Delete the prompt message
    if (userState.aiChatPromptMessageId) {
        await bot.deleteMessage(chatId, userState.aiChatPromptMessageId);
    }

    const failMessage = await bot.sendMessage(chatId, 'Maximum attempts reached. Returning to main menu.');
    
    setTimeout(async () => {
        await bot.deleteMessage(chatId, failMessage.message_id);
        await menuHandler.sendInitialMenu(bot, chatId);  // Use menuHandler.sendInitialMenu
    }, 2000);

    setState(chatId, { 
        inAIChat: false, 
        aiChatAttempts: 0, 
        awaitingAIAuthCode: false,
        aiChatPromptMessageId: null
    });
}

async function endAIChat(bot, chatId, sendInitialMenuCallback) {
    logger.info(`${colors.blue}Ending AI Chat for chatId=${chatId}${colors.reset}`);
    const userState = getState(chatId);
    if (userState && userState.aiChatMessageId) {
        try {
            await bot.deleteMessage(chatId, userState.aiChatMessageId);
        } catch (error) {
            logger.warn(`Failed to delete AI chat message for userId: ${chatId}. It might have already been deleted.`);
        }
    }
    setState(chatId, { 
        aiChatMessageId: null, 
        inAIChat: false, 
        aiChatAttempts: 0,
        awaitingAIAuthCode: false,
        aiChatPromptMessageId: null,
        aiChatHistory: []  // Clear the chat history
    });
    try {
        await sendInitialMenuCallback(bot, chatId);
    } catch (error) {
        logger.error(`Error sending initial menu: ${error.message}`);
        await bot.sendMessage(chatId, "An error occurred. Please use /start to return to the main menu.");
    }
}

async function handleAIChatMessage(bot, msg, user) {
    const chatId = msg.chat.id;
    const messageContent = msg.text;

    logger.info(`${colors.blue}Handling AI Chat message for chatId=${chatId}${colors.reset}`);

    const userState = getState(chatId);
    if (!userState.aiChatHistory) {
        userState.aiChatHistory = [];
    }

    // Add user message to history
    userState.aiChatHistory.push({ role: "user", content: messageContent });

    try {
        const aiResponse = await handleAIConversation(userState.aiChatHistory, user.language);

        // Add AI response to history
        userState.aiChatHistory.push({ role: "assistant", content: aiResponse });

        // Keep only the last 10 messages
        if (userState.aiChatHistory.length > 10) {
            userState.aiChatHistory = userState.aiChatHistory.slice(-10);
        }

        // Remove "End Chat" button from the previous message
        if (userState.lastAIMessageId) {
            try {
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                    chat_id: chatId,
                    message_id: userState.lastAIMessageId
                });
            } catch (error) {
                logger.warn(`Failed to remove 'End Chat' button from previous message: ${error.message}`);
            }
        }

        // Send new message with formatting and "End Chat" button
        const formattedResponse = applyFormatting(aiResponse);
        const sentMessage = await bot.sendMessage(chatId, formattedResponse, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'End Chat', callback_data: 'end_ai_chat' }]
                ]
            }
        });

        // Save the message to the database
        await saveMessage(chatId, user._id.toString(), messageContent, aiResponse, user.dialect);

        // Update the state with the new message ID
        setState(chatId, { 
            aiChatHistory: userState.aiChatHistory,
            lastAIMessageId: sentMessage.message_id
        });

    } catch (error) {
        logger.error(`${colors.red}Error in AI Chat: ${error.message}${colors.reset}`);
        await bot.sendMessage(chatId, "I'm sorry, but I encountered an error. Please try again.");
    }
}

function applyFormatting(text) {
    // Apply basic HTML formatting
    return text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')  // Bold
        .replace(/\*(.*?)\*/g, '<i>$1</i>')      // Italic
        .replace(/`(.*?)`/g, '<code>$1</code>'); // Code
}

module.exports = {
    startAIChat,
    endAIChat,
    handleAIChatMessage,
    handleAuthCode
};