const stateManager = require('./stateManager');
const logger = require('../logger');

const validateUserState = (req, res, next) => {
  const { userId } = req.body;
  logger.info(`Validating user state for userId: ${userId}`);
  
  const userState = stateManager.getState(userId);
  
  if (!userState) {
    logger.warn(`No state found for userId: ${userId}`);
    return res.status(400).send('Invalid user state');
  }
  
  next();
};

module.exports = {
  validateUserState,
};
