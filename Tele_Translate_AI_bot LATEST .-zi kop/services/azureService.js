const axios = require('axios');
const logger = require('../logger');

const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiVersion = "2024-04-01-preview";
const deployment = "ProcessorInformation2";

const generateEnhancedPrompt = (message, context, sourceUser, targetUser, conversationHistory) => {
  const prompt = `
    Translate the following message accurately, paying attention to nuance and potentially implied meaning while being sure to maintain both the meaning and the context, and adjust the phrasing and words to sound natural and conversational as if both users are natively speaking the receiver's language. Do not use quotation marks or reply with anything other than the adjusted translated message.
    Conversation History: 
    ${conversationHistory.map(m => `${m.sender === sourceUser._id ? 'User A' : 'User B'}: ${m.content}`).join('\n')}
    Current Context: ${context}
    Original Message: ${message}
    From ${sourceUser.language} to ${targetUser.language}.
    Ensure the translation reflects a casual, conversational tone. Try to naturally phrase translations to imply any relevant details from the original message when possible, especially if the response is to a message that occurred prior to the most recent messages.
  `;
  logger.info('Generated enhanced prompt:', { prompt });
  return prompt;
};

const translateMessage = async (message, context, sourceUser, targetUser, conversationHistory) => {
  const enhancedPrompt = generateEnhancedPrompt(message, context, sourceUser, targetUser, conversationHistory);

  try {
    const response = await axios.post(`${azureEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
      messages: [{ role: "user", content: enhancedPrompt }],
      max_tokens: 150,
      temperature: 0.7
    }, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': azureApiKey
      }
    });

    const translatedText = response.data.choices[0].message.content.trim();
    logger.info(`Enhanced translation: ${translatedText}`);
    return translatedText;
  } catch (error) {
    logger.error('Error enhancing translation:', error.response ? error.response.data : error.message);
    throw new Error('Failed to enhance translation');
  }
};

const analyzeContext = async (messages) => {
  try {
    const response = await axios.post(`${azureEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
      messages: [{ role: "user", content: `Analyze the following conversation and summarize the context, sentiment, meaning, and intention in 3-4 sentences or less: ${messages.map(m => m.content).join(' ')}` }],
      max_tokens: 650,
      temperature: 0.77
    }, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': azureApiKey
      }
    });

    const context = response.data.choices[0].message.content.trim();
    logger.info(`Context analysis result: ${context}`);
    return context;
  } catch (error) {
    logger.error('Error analyzing context:', error.response ? error.response.data : error.message);
    throw new Error('Failed to analyze context');
  }
};

// const generateDetailedPrompt = (message, context, sourceUser, targetUser) => {
//   logger.info('Generating detailed prompt');
//   const prompt = `
//     Translate the following message accurately, maintaining the meaning and context. DO NOT output anything but the translated message.
//     Context: ${context}
//     From ${sourceUser.language} to ${targetUser.language}.
//     Message: ${message}
//   `;
//   logger.info('Generated prompt:', { prompt });
//   return prompt;
// };


module.exports = {
  analyzeContext,
  generateEnhancedPrompt,
  translateMessage
};
