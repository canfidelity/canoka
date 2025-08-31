const winston = require('winston');
const path = require('path');

// Log formatları
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
  })
);

// Logger oluştur
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    
    // File outputs
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log')
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/trades.log'),
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// Trading specific logger
logger.trade = (action, data) => {
  logger.info(`TRADE_${action.toUpperCase()}`, { 
    action, 
    timestamp: new Date().toISOString(),
    ...data 
  });
};

// Signal specific logger
logger.signal = (type, data) => {
  logger.info(`SIGNAL_${type.toUpperCase()}`, { 
    type, 
    timestamp: new Date().toISOString(),
    ...data 
  });
};

module.exports = logger;
