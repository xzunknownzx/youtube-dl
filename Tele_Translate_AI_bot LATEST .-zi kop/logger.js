const { createLogger, format, transports } = require('winston');
const moment = require('moment-timezone');

const customFormat = format.printf(({ timestamp, level, message, ...meta }) => {
  const localTimestamp = moment(timestamp).tz('America/New_York').format('HH:mm:ss');
  const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${localTimestamp} ${level}=${message}${metaString}`;
});

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.colorize(),
    format.timestamp(),
    customFormat
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'combined.log' })
  ],
});

module.exports = logger;
