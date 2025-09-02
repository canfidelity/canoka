const Joi = require('joi');
const logger = require('../utils/logger');

// TradingView webhook schema - string'leri number'a convert et
const tradingViewSchema = Joi.object({
  strategy: Joi.string().required(),
  action: Joi.string().valid('BUY', 'SELL').required(),
  symbol: Joi.string().required(),
  timeframe: Joi.string().required(),
  price: Joi.alternatives().try(
    Joi.number().positive(),
    Joi.string().custom((value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) {
        throw new Error('Invalid price');
      }
      return num;
    })
  ).required(),
  timestamp: Joi.alternatives().try(
    Joi.number(),
    Joi.string().custom((value) => {
      const num = parseInt(value);
      if (isNaN(num) || num <= 0) {
        throw new Error('Invalid timestamp');
      }
      return num;
    })
  ).required(),
  secret: Joi.string().required()
}).options({ stripUnknown: true });

// Webhook validation middleware
const validateWebhook = (req, res, next) => {
  try {
    // İlk olarak gelen veriyi loglayalım
    logger.info('📡 Webhook verisi alındı:', { 
      body: req.body, 
      headers: req.headers['content-type'],
      ip: req.ip 
    });
    
    // Secret kontrolü
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (!expectedSecret) {
      logger.error('WEBHOOK_SECRET tanımlanmamış');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    // Body yoksa hata
    if (!req.body || Object.keys(req.body).length === 0) {
      logger.warn('Boş webhook verisi', { ip: req.ip });
      return res.status(400).json({ error: 'Empty webhook data' });
    }
    
    if (req.body.secret !== expectedSecret) {
      logger.warn('Geçersiz webhook secret', { 
        ip: req.ip, 
        receivedSecret: req.body.secret ? 'EXISTS' : 'MISSING',
        expectedExists: !!expectedSecret
      });
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Schema validation
    const { error, value } = tradingViewSchema.validate(req.body);
    if (error) {
      logger.warn('Geçersiz webhook data:', { 
        error: error.details,
        receivedData: req.body,
        missingFields: error.details.map(d => d.path.join('.'))
      });
      return res.status(400).json({ 
        error: 'Invalid data format',
        details: error.details,
        received: req.body
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
