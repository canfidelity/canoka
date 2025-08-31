const Joi = require('joi');
const logger = require('../utils/logger');

// TradingView webhook schema
const tradingViewSchema = Joi.object({
  strategy: Joi.string().required(),
  action: Joi.string().valid('BUY', 'SELL').required(),
  symbol: Joi.string().required(),
  timeframe: Joi.string().required(),
  price: Joi.number().positive().required(),
  timestamp: Joi.number().required(),
  secret: Joi.string().required()
});

// Webhook validation middleware
const validateWebhook = (req, res, next) => {
  try {
    // Secret kontrolü
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (!expectedSecret) {
      logger.error('WEBHOOK_SECRET tanımlanmamış');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    if (req.body.secret !== expectedSecret) {
      logger.warn('Geçersiz webhook secret', { ip: req.ip });
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Schema validation
    const { error, value } = tradingViewSchema.validate(req.body);
    if (error) {
      logger.warn('Geçersiz webhook data:', error.details);
      return res.status(400).json({ 
        error: 'Invalid data format',
        details: error.details
      });
    }
    
    req.validatedBody = value;
    next();
    
  } catch (err) {
    logger.error('Validation middleware hatası:', err);
    res.status(500).json({ error: 'Validation error' });
  }
};

module.exports = {
  validateWebhook,
  tradingViewSchema
};
