const express = require('express');
const router = express.Router();
const backtestService = require('../services/backtestService');
const logger = require('../utils/logger');

// Test endpoint
router.get('/test', (req, res) => {
  console.log('🔍 Test endpoint çağrıldı!');
  const result = backtestService.testFunction();
  res.json({
    success: true,
    message: 'Test endpoint çalışıyor',
    result: result
  });
});

// Backtest başlat
router.post('/start', async (req, res) => {
  try {
    const {
      symbol = 'ETH-USDT',
      timeframe = '15m',
      startDate = '2024-01-01',
      endDate = '2024-01-31',
      initialBalance = 1000,
      usdtPerTrade = 10
    } = req.body;
    
    logger.info(`🧪 Backtest başlatılıyor: ${symbol} ${timeframe} ${startDate} - ${endDate}`);
    
    const results = await backtestService.runBacktest({
      symbol,
      timeframe,
      startDate,
      endDate,
      initialBalance,
      usdtPerTrade
    });
    
    res.json({
      success: true,
      message: 'Backtest tamamlandı',
      data: results
    });
    
  } catch (error) {
    logger.error('Backtest start error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Backtest results'ı getir
router.get('/results', async (req, res) => {
  try {
    const results = await backtestService.getBacktestResults();
    
    if (!results) {
      return res.json({
        success: false,
        message: 'Henüz backtest yapılmamış'
      });
    }
    
    res.json({
      success: true,
      data: results
    });
    
  } catch (error) {
    logger.error('Backtest results error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Backtest stats'ı getir
router.get('/stats', async (req, res) => {
  try {
    const stats = backtestService.getStats();
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    logger.error('Backtest stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Hızlı backtest preset'leri
router.post('/preset/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { symbol = 'ETH-USDT' } = req.body;
    
    let options = {};
    
    switch (type) {
      case 'last_week':
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        options = {
          symbol,
          timeframe: '15m',
          startDate: lastWeek.toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          initialBalance: 1000,
          usdtPerTrade: 10
        };
        break;
        
      case 'last_month':
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        options = {
          symbol,
          timeframe: '15m',
          startDate: lastMonth.toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          initialBalance: 1000,
          usdtPerTrade: 10
        };
        break;
        
      case 'last_3months':
        const last3Months = new Date();
        last3Months.setMonth(last3Months.getMonth() - 3);
        options = {
          symbol,
          timeframe: '15m',
          startDate: last3Months.toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          initialBalance: 1000,
          usdtPerTrade: 10
        };
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: 'Geçersiz preset type',
          available: ['last_week', 'last_month', 'last_3months']
        });
    }
    
    logger.info(`🧪 Preset backtest başlatılıyor: ${type} ${symbol}`);
    
    const results = await backtestService.runBacktest(options);
    
    res.json({
      success: true,
      message: `${type} preset backtest tamamlandı`,
      data: results
    });
    
  } catch (error) {
    logger.error('Preset backtest error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Backtest'i durdur (eğer uzun sürerse)
router.post('/stop', async (req, res) => {
  try {
    // Backtest service'de stop mechanism'i eklenebilir
    logger.info('🛑 Backtest stop requested');
    
    res.json({
      success: true,
      message: 'Backtest stop requested'
    });
    
  } catch (error) {
    logger.error('Backtest stop error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Backtest config'ini güncelle
router.post('/config', async (req, res) => {
  try {
    const { usdtPerTrade, tpPercent, slPercent } = req.body;
    
    // Config service'i güncelle
    const configService = require('../services/configService');
    
    if (usdtPerTrade) configService.set('DEFAULT_USDT_AMOUNT', usdtPerTrade);
    if (tpPercent) configService.set('DEFAULT_TP_PERCENT', tpPercent);
    if (slPercent) configService.set('DEFAULT_SL_PERCENT', slPercent);
    
    logger.info('⚙️ Backtest config updated', { usdtPerTrade, tpPercent, slPercent });
    
    res.json({
      success: true,
      message: 'Backtest config güncellendi',
      config: {
        usdtPerTrade: configService.get('DEFAULT_USDT_AMOUNT'),
        tpPercent: configService.get('DEFAULT_TP_PERCENT'),
        slPercent: configService.get('DEFAULT_SL_PERCENT')
      }
    });
    
  } catch (error) {
    logger.error('Backtest config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
