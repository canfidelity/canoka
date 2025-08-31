const express = require('express');
const router = express.Router();
const { validateWebhook } = require('../middlewares/validation');
const webhookController = require('../controllers/webhookController');
const logger = require('../utils/logger');

// TradingView webhook endpoint
router.post('/tradingview', validateWebhook, async (req, res) => {
  try {
    logger.info('📡 TradingView sinyali alındı');
    
    const result = await webhookController.processTradingViewSignal(req.body);
    
    res.json({
      success: true,
      message: 'Sinyal işlendi',
      data: result
    });
    
  } catch (error) {
    logger.error('Webhook işleme hatası:', error);
    res.status(500).json({
      success: false,
      error: 'Sinyal işlenemedi'
    });
  }
});

// Test endpoint
router.post('/test', (req, res) => {
  logger.info('🧪 Test webhook çağrıldı');
  res.json({
    success: true,
    message: 'Test başarılı',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
