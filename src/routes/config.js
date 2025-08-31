const express = require('express');
const router = express.Router();
const configService = require('../services/configService');
const logger = require('../utils/logger');

// Get current configuration
router.get('/', (req, res) => {
  try {
    const config = configService.getAll();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Config get error:', error);
    res.status(500).json({
      success: false,
      error: 'Konfigürasyon alınamadı'
    });
  }
});

// Update trading configuration
router.post('/trading', (req, res) => {
  try {
    const updates = req.body;
    
    // Validate updates
    const allowedKeys = [
      'DEFAULT_USDT_AMOUNT',
      'DEFAULT_TP_PERCENT',
      'DEFAULT_SL_PERCENT',
      'MAX_ACTIVE_TRADES',
      'MAX_TRADES_PER_COIN',
      'ENTRY_DISTANCE_PERCENT',
      'ADX_THRESHOLD',
      'RVOL_THRESHOLD',
      'BB_WIDTH_THRESHOLD'
    ];
    
    const validUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key)) {
        validUpdates[key] = parseFloat(value) || value;
      }
    }
    
    if (Object.keys(validUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Geçerli ayar bulunamadı',
        allowedKeys
      });
    }
    
    configService.updateTradingConfig(validUpdates);
    
    logger.info('💼 Trading config updated via API', validUpdates);
    
    res.json({
      success: true,
      message: 'Trading ayarları güncellendi',
      updated: validUpdates
    });
    
  } catch (error) {
    logger.error('Config update error:', error);
    res.status(500).json({
      success: false,
      error: 'Ayarlar güncellenemedi'
    });
  }
});

// Toggle AI
router.post('/ai/toggle', (req, res) => {
  try {
    const currentStatus = configService.get('AI_ENABLED');
    const newStatus = !currentStatus;
    
    configService.set('AI_ENABLED', newStatus);
    
    logger.info(`🤖 AI ${newStatus ? 'enabled' : 'disabled'} via API`);
    
    res.json({
      success: true,
      message: `AI ${newStatus ? 'aktif' : 'devre dışı'}`,
      aiEnabled: newStatus
    });
    
  } catch (error) {
    logger.error('AI toggle error:', error);
    res.status(500).json({
      success: false,
      error: 'AI ayarı değiştirilemedi'
    });
  }
});

// Get filter thresholds
router.get('/filters', (req, res) => {
  try {
    const filters = {
      ADX_THRESHOLD: configService.get('ADX_THRESHOLD'),
      RVOL_THRESHOLD: configService.get('RVOL_THRESHOLD'),
      BB_WIDTH_THRESHOLD: configService.get('BB_WIDTH_THRESHOLD'),
      AI_ENABLED: configService.get('AI_ENABLED')
    };
    
    res.json({
      success: true,
      data: filters
    });
    
  } catch (error) {
    logger.error('Filter config error:', error);
    res.status(500).json({
      success: false,
      error: 'Filtre ayarları alınamadı'
    });
  }
});

// Update filter thresholds
router.post('/filters', (req, res) => {
  try {
    const { adx, rvol, bbWidth } = req.body;
    
    const updates = {};
    if (adx !== undefined) updates.ADX_THRESHOLD = parseFloat(adx);
    if (rvol !== undefined) updates.RVOL_THRESHOLD = parseFloat(rvol);
    if (bbWidth !== undefined) updates.BB_WIDTH_THRESHOLD = parseFloat(bbWidth);
    
    for (const [key, value] of Object.entries(updates)) {
      configService.set(key, value);
    }
    
    logger.info('🔧 Filter thresholds updated via API', updates);
    
    res.json({
      success: true,
      message: 'Filtre eşikleri güncellendi',
      updated: updates
    });
    
  } catch (error) {
    logger.error('Filter update error:', error);
    res.status(500).json({
      success: false,
      error: 'Filtre ayarları güncellenemedi'
    });
  }
});

// Quick presets
router.post('/preset/:name', (req, res) => {
  try {
    const { name } = req.params;
    let preset = {};
    
    switch (name) {
      case 'conservative':
        preset = {
          DEFAULT_TP_PERCENT: 0.3,
          DEFAULT_SL_PERCENT: 0.2,
          MAX_ACTIVE_TRADES: 3,
          ADX_THRESHOLD: 25,
          RVOL_THRESHOLD: 1.5
        };
        break;
        
      case 'balanced':
        preset = {
          DEFAULT_TP_PERCENT: 0.5,
          DEFAULT_SL_PERCENT: 0.3,
          MAX_ACTIVE_TRADES: 5,
          ADX_THRESHOLD: 20,
          RVOL_THRESHOLD: 1.2
        };
        break;
        
      case 'aggressive':
        preset = {
          DEFAULT_TP_PERCENT: 0.8,
          DEFAULT_SL_PERCENT: 0.4,
          MAX_ACTIVE_TRADES: 8,
          ADX_THRESHOLD: 15,
          RVOL_THRESHOLD: 1.0
        };
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: 'Geçersiz preset',
          available: ['conservative', 'balanced', 'aggressive']
        });
    }
    
    configService.updateTradingConfig(preset);
    
    logger.info(`📋 Applied ${name} preset via API`);
    
    res.json({
      success: true,
      message: `${name} preset uygulandı`,
      preset
    });
    
  } catch (error) {
    logger.error('Preset error:', error);
    res.status(500).json({
      success: false,
      error: 'Preset uygulanamadı'
    });
  }
});

module.exports = router;
