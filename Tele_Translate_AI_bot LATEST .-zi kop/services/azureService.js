const mongoose = require('mongoose');
const logger = require('../logger');
const Message = require('../models/Message');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const FormData = require('form-data');
const fs = require('fs');
process.stdout.setEncoding('utf8');  
const exec = require('child_process').exec;
const { AzureOpenAI } = require("openai");
const axios = require('axios');
const path = require('path'); // Import the path module
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env in the parent directory
const { regions, dialectMapping } = require('./languages.js'); // Import necessary mappings
const os = require('os');

// ANSI color codes for logging (Optional)
const colors = {  
    reset: "\x1b[0m",  
    blue: "\x1b[34m",  
    green: "\x1b[32m",  
    yellow: "\x1b[33m",  
    red: "\x1b[31m",  
    cyan: "\x1b[36m",  
    bold: "\x1b[1m",  
    neonBlue: "\x1b[1;34m\x1b[5m", // Bright blue with bold  
    neonGreen: "\x1b[1;32m\x1b[5m", // Bright green with bold  
};

// Environment variables
const endpoint = process.env["AZURE_OPENAI_ENDPOINT"];
const apiKey = process.env["AZURE_OPENAI_API_KEY"];
const apiVersion = process.env["AZURE_OPENAI_API_VERSION"];
const deployment = process.env["AZURE_OPENAI_DEPLOYMENT"];

// Initialize the AzureOpenAI client
const client = new AzureOpenAI({ 
    endpoint: endpoint, 
    apiKey: apiKey, 
    apiVersion: apiVersion, 
    deployment: deployment 
});

const getLanguageWithDialect = (language, region, dialect) => {
  if (dialect) {
    return `${language}-${region}-${dialect}`;
  } else if (region) {
    return `${language}-${region}`;
  } else {
    return language;
  }
};
// Construct language identifier using the language and region/dialect
function constructLanguageIdentifier(language, region) {
  if (!language) {
    console.error('Error: Language is undefined.');
    return 'en-US'; 
  }

  const languageCode = language.replace('lang_', ''); 
  
  if (region) {
    const dialectCode = dialectMapping[region] || `${languageCode}-${region.toUpperCase()}`;
    console.log(`Constructing language identifier: ${dialectCode}`);
    return dialectCode;
  } else {
    console.log(`Constructing language identifier with language only: ${languageCode}`);
    return languageCode;
  }
}

// Transcribe audio with Azure API
async function transcribeAudio(filePath, languageIdentifier) {
  console.log(`Step: Audio Transcription Started for filePath: ${filePath}, languageWithDialect: ${languageIdentifier}`);

  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  try {
    console.log(`Step: Form Data Prepared for Transcription`);
    const response = await axios.post(
      `${process.env.AZURE_OPENAI_WHISPER_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT}/audio/transcriptions?api-version=${process.env.AZURE_OPENAI_WHISPER_API_VERSION}&language=${languageIdentifier}`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'api-key': process.env.AZURE_OPENAI_WHISPER_API_KEY,
        },
        maxContentLength: 25 * 1024 * 1024,
        maxBodyLength: 25 * 1024 * 1024,
      }
    );

    console.log(`Step: Received Response - Status: ${response.status}`);
    
    if (response.status === 200 && response.data) {
      console.log(`Step: Audio Transcription Completed Successfully`);
      return response.data; 
    } else {
      console.error(`Error: Transcription Failed - Status: ${response.status}, Data: ${JSON.stringify(response.data)}`);
      throw new Error('Failed to transcribe audio');
    }
  } catch (error) {
    console.error(`Error: During Audio Transcription - ${error.message}`);
    if (error.response) {
      console.error(`Error Details: Response Data: ${JSON.stringify(error.response.data)}`);
      console.error(`Response Status: ${error.response.status}`);
      console.error(`Response Headers: ${JSON.stringify(error.response.headers)}`);
    } else if (error.request) {
      console.error(`Error: No Response Received - Request Data: ${error.request}`);
    } else {
      console.error(`Unexpected Error: ${error.message}`);
    }
    throw error;
  }
}

const translateVerbatim = async (message, userLanguage, region, dialect) => {  
  const languageWithDialect = getLanguageWithDialect(userLanguage, region, dialect);  
  console.log(`${colors.neonBlue}Step:${colors.reset} Verbatim Translation Started`);  
  
  const prompt = `  
    Translate the following message verbatim, retaining original punctuation and structure. Do not interpret the meaning; translate word for word.  
    Original Message: ${message}  
    Language: ${languageWithDialect}.  
  `;  
  
  console.log(`${colors.neonBlue}Input:${colors.reset} Prompt = ${prompt.trim()}`);  
  
  try {  
    const result = await client.chat.completions.create({  
      messages: [{ role: "user", content: prompt }],  
      model: process.env.AZURE_OPENAI_DEPLOYMENT,  
      max_tokens: 150,  
      temperature: 0.0  
    });  
  
    const verbatimText = result.choices[0].message.content.trim();  
    console.log(`${colors.neonGreen}Step:${colors.reset} Verbatim Translation Completed`);  
    console.log(`${colors.neonBlue}Output:${colors.reset} Verbatim Translation = ${verbatimText}`);  
    return verbatimText;  
  } catch (error) {  
    console.error(`${colors.red}Error:${colors.reset} Verbatim Translation Failed - ${error.message}`);  
    throw new Error('Failed to translate verbatim');  
  }  
};  

const translateMessage = async (message, context, sourceUser, targetUser, conversationHistory) => {
  const sourceLanguageIdentifier = constructLanguageIdentifier(sourceUser.language, sourceUser.location);
  const targetLanguageIdentifier = constructLanguageIdentifier(targetUser.language, targetUser.location);

  const enhancedPrompt = generateEnhancedPrompt(message, context, sourceUser, targetUser, conversationHistory, sourceLanguageIdentifier, targetLanguageIdentifier);

  console.log(`Step: Message Translation Started with Source Language: ${sourceLanguageIdentifier} and Target Language: ${targetLanguageIdentifier}`);

  try {
    const result = await client.chat.completions.create({
      messages: [{ role: "user", content: enhancedPrompt }],
      model: process.env.AZURE_OPENAI_DEPLOYMENT,
      max_tokens: 150,
      temperature: 0.7
    });

    const translatedText = result.choices[0].message.content.trim();
    console.log(`Step: Message Translation Completed. Translated Text: ${translatedText}`);
    return translatedText;
  } catch (error) {
    console.error(`Error: Message Translation Failed - ${error.message}`);
    throw new Error('Failed to enhance translation');
  }
};

const generateEnhancedPrompt = (message, context, sourceUser, targetUser, conversationHistory, sourceLanguageIdentifier, targetLanguageIdentifier) => {
  console.log(`Step: Generating Enhanced Prompt for translation`);

  let history = 'No prior conversation history available.';
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    history = conversationHistory.map(m => `${m.sender === sourceUser._id ? 'User A' : 'User B'}: ${m.content}`).join('\n');
  }

  const prompt = `
    Translate the following message accurately, paying attention to nuance and potentially implied meaning while being sure to maintain both the meaning and the context. 
    Do not output any text beyond your interpreted translation to the language.
    Conversation History:
    ${history}
    Current Context: ${context}
    Original Message: ${message}
    From ${sourceLanguageIdentifier} to ${targetLanguageIdentifier}.
    Ensure the translation reflects a casual, conversational tone.
  `;

  console.log(`Input: Enhanced Prompt Generated`);
  return prompt;
};

const analyzeContext = async (messages, user) => {
  const languageIdentifier = constructLanguageIdentifier(user.language, user.location);
  console.log(`Step: Context Analysis Started for language: ${languageIdentifier}`);

  const conversationText = messages.map(m => m.content || 'Message content missing').join(' ');

  console.log(`Input: Conversation Text = ${conversationText}`);

  try {
    const result = await client.chat.completions.create({
      messages: [{ role: "user", content: `Analyze the following conversation and summarize the context, sentiment, meaning, and intention in 5-6 sentences or less. Language: ${languageIdentifier}. Conversation: ${conversationText}` }],
      model: process.env.AZURE_OPENAI_DEPLOYMENT,
      max_tokens: 800,
      temperature: 0.85
    });

    const contextSummary = result.choices[0].message.content.trim();
    console.log(`Step: Context Analysis Completed. Context Summary: ${contextSummary}`);
    return contextSummary;
  } catch (error) {
    console.error(`Error: Context Analysis Failed - ${error.message}`);
    throw new Error('Failed to analyze context');
  }
};  
const generateAdvancedPrompt = (message, context, sourceUser, targetUser, conversationHistory) => {
  const sourceLanguageWithDialect = getLanguageWithDialect(sourceUser.language, sourceUser.region, sourceUser.dialect);
  const targetLanguageWithDialect = getLanguageWithDialect(targetUser.language, targetUser.region, targetUser.dialect);
  console.log(`${colors.neonBlue}Step:${colors.reset} Generating Advanced Prompt`);

  let history = 'No prior conversation history available.';
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    history = conversationHistory.map(m => {
      if (m.sender.toString() === sourceUser._id.toString()) {
        return `User A: ${m.content}`;
      } else if (m.sender.toString() === targetUser._id.toString()) {
        return `User B: ${m.content}`;
      } else {
        return `Unknown User: ${m.content}`;
      }
    }).join('\n');
  }

  const prompt = `
    The previous translation was unclear: "${message}". Please refine it by paying more attention to nuance and contextually implied meaning while ensuring both the meaning and the understanding of prior conversations are maintained.
    Extended Conversation History:
    ${history}
    Current Context: ${context}
    Original Message: ${message}
    From ${sourceLanguageWithDialect} to ${targetLanguageWithDialect}.
    Ensure the translation reflects a nuanced and accurate interpretation of the conversation.
  `;

  console.log(`${colors.neonBlue}Input:${colors.reset} Advanced Prompt = ${prompt.trim()}`);
  return prompt;
};

  
const translateAdvancedMessage = async (message, context, sourceUser, targetUser, conversationHistory) => {  
  const advancedPrompt = generateAdvancedPrompt(message, context, sourceUser, targetUser, conversationHistory);  
  console.log(`${colors.neonBlue}Step:${colors.reset} Advanced Message Translation Started`);  
  
  try {  
    const result = await client.chat.completions.create({  
      messages: [{ role: "user", content: advancedPrompt }],  
      model: process.env.AZURE_OPENAI_DEPLOYMENT,  
      max_tokens: 300,  
      temperature: 0.8  
    });  
  
    const advancedTranslation = result.choices[0].message.content.trim();  
    console.log(`${colors.neonGreen}Step:${colors.reset} Advanced Message Translation Completed`);  
    console.log(`${colors.neonBlue}Output:${colors.reset} Advanced Translation = ${advancedTranslation}`);  
    return advancedTranslation;  
  } catch (error) {  
    console.error(`${colors.red}Error:${colors.reset} Advanced Translation Failed - ${error.message}`);  
    throw new Error('Failed to perform advanced translation');  
  }  
};  
  
const analyzeAdvancedContext = async (messages, user) => {  
  const languageWithDialect = getLanguageWithDialect(user.language, user.region, user.dialect);
  console.log(`${colors.neonBlue}Step:${colors.reset} Advanced Context Analysis Started`);  
  
  const conversationText = messages.map(m => m.content || 'Message content missing').join(' ');  
  
  console.log(`${colors.neonBlue}Input:${colors.reset} Advanced Conversation Text = ${conversationText}`);  
  
  try {  
    const result = await client.chat.completions.create({  
      messages: [{ role: "user", content: `Analyze the following extended conversation and summarize the context, sentiment, meaning, and intention in 5-6 sentences or less. Language: ${languageWithDialect}. Conversation: ${conversationText}` }],  
      model: process.env.AZURE_OPENAI_DEPLOYMENT,  
      max_tokens: 800,  
      temperature: 0.85  
    });  
  
    const advancedContext = result.choices[0].message.content.trim();  
    console.log(`${colors.neonGreen}Step:${colors.reset} Advanced Context Analysis Completed`);  
    console.log(`${colors.neonBlue}Output:${colors.reset} Advanced Context Summary = ${advancedContext}`);  
    return advancedContext;  
  } catch (error) {  
    console.error(`${colors.red}Error:${colors.reset} Advanced Context Analysis Failed - ${error.message}`);  
    throw new Error('Failed to analyze advanced context');  
  }  
};  


const shModelPath = "sh.rnnn";  // Model is in the same directory as ffmpeg

async function cleanAudio(fileName) {
    const cleanedFileName = `cleaned_${fileName}`;
    return new Promise((resolve, reject) => {
        const command = `ffmpeg -i "${fileName}" -af "arnndn=m=${shModelPath}" "${cleanedFileName}"`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error cleaning audio: ${error.message}`);
                reject(error);
            } else {
                console.log(`Audio cleaned successfully: ${cleanedFileName}`);
                resolve(cleanedFileName);
            }
        });
    });
}


module.exports = {   
  translateVerbatim,   
  translateMessage,   
  analyzeContext,   
  translateAdvancedMessage,   
  analyzeAdvancedContext,
  transcribeAudio,
  constructLanguageIdentifier,
  cleanAudio
};  



// const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
// const azureApiKey2 = process.env.AZURE_OPENAI_API_KEY2;
// const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
// const azureEndpoint2 = process.env.AZURE_OPENAI_ENDPOINT2;
// const apiVersion = process.env.AZURE_OPENAI_ENDPOINT;
// const apiVersion2 = process.env.AZURE_OPENAI_ENDPOINT2;
// const deployment = "gpt-4o";
// const whisperDeployment = "whisper2"; // Deployment ID of the Whisper model

// const translateVerbatim = async (message, userLanguage) => {
//   const prompt = `
//     Translate the following message verbatim, retaining original punctuation and structure. Do not interpret the meaning; translate word for word.
//     Original Message: ${message}
//     From en to ${userLanguage}.
//   `;

//   try {
//     const response = await axios.post(`${azureEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
//       messages: [{ role: "user", content: prompt }],
//       max_tokens: 150,
//       temperature: 0.0 // Zero temperature to ensure verbatim translation
//     }, {
//       headers: {
//         'Content-Type': 'application/json',
//         'api-key': azureApiKey
//       }
//     });

//     const verbatimText = response.data.choices[0].message.content.trim();
//     return `- Original (${userLanguage}) - \n${verbatimText}`;
//   } catch (error) {
//     logger.error('Error in verbatim translation:', error.response ? error.response.data : error.message);
//     throw new Error('Failed to translate verbatim');
//   }
// };


// const generateEnhancedPrompt = (message, context, sourceUser, targetUser, conversationHistory) => {
//   let history = 'No prior conversation history available.';
//   if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
//     history = conversationHistory.map(m => `${m.sender === sourceUser._id ? 'User A' : 'User B'}: ${m.content}`).join('\n');
//     logger.info('History:', { history });
//   } else {
//     logger.error('conversationHistory is undefined, not an array, or empty.');
//   }

//   const prompt = `
//     Translate the following message accurately, paying attention to nuance and potentially implied meaning while being sure to maintain both the meaning and the context, and adjust the phrasing and words to sound natural and conversational as if both users are natively speaking the receiver's language. Do not use quotation marks or reply with anything other than the adjusted translated message.
//     Conversation History: 
//     ${history}
//     Current Context: ${context}
//     Original Message: ${message}
//     From ${sourceUser.language} to ${targetUser.language}.
//     Ensure the translation reflects a casual, conversational tone. Try to naturally phrase translations to imply any relevant details from the original message when possible, especially if the response is to a message that occurred prior to the most recent messages.
//   `;
//   logger.info('Generated enhanced prompt:', { prompt });
//   return prompt;
// };


// const translateMessage = async (message, context, sourceUser, targetUser, conversationHistory) => {
//   const enhancedPrompt = generateEnhancedPrompt(message, context, sourceUser, targetUser, conversationHistory);

//   try {
//     const response = await axios.post(`${azureEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
//       messages: [{ role: "user", content: enhancedPrompt }],
//       max_tokens: 150,
//       temperature: 0.7
//     }, {
//       headers: {
//         'Content-Type': 'application/json',
//         'api-key': azureApiKey
//       }
//     });

//     const translatedText = response.data.choices[0].message.content.trim();
//     logger.info(`~~Original ==== (${message})`);
//     logger.info(`~~Translation = (${sourceUser.language} --> ${targetUser.language}): ${translatedText}`);
//     return translatedText;
//   } catch (error) {
//     logger.error('Error enhancing translation:', error.response ? error.response.data : error.message);
//     throw new Error('Failed to enhance translation');
//   }
// };

// const analyzeContext = async (messages) => {
//   try {
//     const response = await axios.post(`${azureEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
//       messages: [{ role: "user", content: `Analyze the following conversation and summarize the context, sentiment, meaning, and intention in 3-4 sentences or less: ${messages.map(m => m.content).join(' ')}` }],
//       max_tokens: 650,
//       temperature: 0.77
//     }, {
//       headers: {
//         'Content-Type': 'application/json',
//         'api-key': azureApiKey
//       }
//     });

//     const context = response.data.choices[0].message.content.trim();
//     logger.info(`Context analysis result: ${context}`);
//     return context;
//   } catch (error) {
//     logger.error('Error analyzing context:', error.response ? error.response.data : error.message);
//     throw new Error('Failed to analyze context');
//   }
// };

// // Advanced Prompt Generation
// const generateAdvancedPrompt = (message, context, sourceUser, targetUser, conversationHistory) => {
//   let history = 'No prior conversation history available.';
//   if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
//     history = conversationHistory.map(m => `${m.sender === sourceUser._id ? 'User A' : 'User B'}: ${m.content}`).join('\n');
//     logger.info('History:', { history });
//   } else {
//     logger.error('conversationHistory is undefined, not an array, or empty.');
//   }

//   const prompt = `
//     The previous translation was unclear: "${message}". Please refine it by paying more attention to nuance and contextually implied meaning while ensuring both the meaning and the understanding of prior conversations are maintained. Adjust the phrasing to sound natural and conversational as if both users are natively speaking the receiver's language.
//     Extended Conversation History: 
//     ${history}
//     Current Context: ${context}
//     Original Message: ${message}
//     From ${sourceUser.language} to ${targetUser.language}.
//     Ensure the translation reflects a nuanced and accurate interpretation of the conversation.
//   `;
//   logger.info('Generated advanced prompt:', { prompt });
//   return prompt;
// };

// // Advanced Message Translation
// const translateAdvancedMessage = async (message, context, sourceUser, targetUser, conversationHistory) => {
//   const advancedPrompt = generateAdvancedPrompt(message, context, sourceUser, targetUser, conversationHistory);

//   try {
//     const response = await axios.post(`${azureEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
//       messages: [{ role: "user", content: advancedPrompt }],
//       max_tokens: 300,
//       temperature: 0.8
//     }, {
//       headers: {
//         'Content-Type': 'application/json',
//         'api-key': azureApiKey
//       }
//     });

//     const advancedTranslation = response.data.choices[0].message.content.trim();
//     logger.info(`Advanced translation: ${advancedTranslation}`);
//     return advancedTranslation;
//   } catch (error) {
//     logger.error('Error in advanced translation:', error.response ? error.response.data : error.message);
//     throw new Error('Failed to perform advanced translation');
//   }
// };

// // Advanced Context Analysis
// const analyzeAdvancedContext = async (messages) => {
//   try {
//     const conversationText = messages.map(m => m.content || 'Message content missing').join(' ');

//     const response = await axios.post(`${azureEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
//       messages: [{ role: "user", content: `Analyze the following extended conversation and summarize the context, sentiment, meaning, and intention in 5-6 sentences or less: ${conversationText}` }],
//       max_tokens: 800,
//       temperature: 0.85
//     }, {
//       headers: {
//         'Content-Type': 'application/json',
//         'api-key': azureApiKey
//       }
//     });

//     const advancedContext = response.data.choices[0].message.content.trim();
//     logger.info(`Advanced context analysis result: ${advancedContext}`);
//     return advancedContext;
//   } catch (error) {
//     logger.error('Error in advanced context analysis:', error.response ? error.response.data : error.message);
//     throw new Error('Failed to analyze advanced context');
//   }
// };



// module.exports = {
//   analyzeContext,
//   analyzeAdvancedContext,
//   generateEnhancedPrompt,
//   generateAdvancedPrompt,
//   translateMessage,
//   translateAdvancedMessage,
//   transcribeAudio,
//   translateVerbatim
// };
// azureService.mjs or after adding "type": "module" in package.json  

// // Load environment variables for GPT-4o model
// const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
// const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
// const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
// const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION;

// // Load environment variables for Whisper model
// const azureWhisperApiKey = process.env.AZURE_OPENAI_WHISPER_API_KEY;
// const azureWhisperEndpoint = process.env.AZURE_OPENAI_WHISPER_ENDPOINT;
// const azureWhisperDeployment = process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT;
// const azureWhisperApiVersion = process.env.AZURE_OPENAI_WHISPER_API_VERSION;
