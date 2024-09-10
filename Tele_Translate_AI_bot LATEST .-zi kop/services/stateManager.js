const state = {};

function getState(chatId) {
    return state[chatId] || {};
}

function setState(chatId, newState) {
    state[chatId] = { ...state[chatId], ...newState };
}

// Add a function to check if a user is in an AI chat
function isInAIChat(chatId) {
    const userState = getState(chatId);
    return userState && userState.inAIChat;
}

module.exports = { getState, setState, isInAIChat };
