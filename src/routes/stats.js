const express = require('express');
const router = express.Router();
const simulationService = require('../services/simulationService');
const riskManager = require('../services/riskManager');
const signalProcessor = require('../services/signalProcessor');
const logger = require('../utils/logger');

// Performance statistics
router.get('/performance', async (req, res) => {
  try {
    const stats = simulationService.getPerformanceStats();
    const riskStats = riskManager.getRiskStats();
    const filterStats = signalProcessor.getFilterStats();
    
    res.json({
      success: true,
      data: {
        performance: stats,
        risk: riskStats,
        filters: filterStats,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Performance stats error:', error);
    res.status(500).json({
      success: false,
      error: 'İstatistikler alınamadı'
    });
  }
});

// Win rate detailed breakdown
router.get('/winrate', async (req, res) => {
  try {
    const stats = simulationService.getPerformanceStats();
    
    const winrateData = {
      overall: {
        winRate: stats.stats.winRate,
        totalTrades: stats.stats.totalTrades,
        winningTrades: stats.stats.winningTrades,
        losingTrades: stats.stats.losingTrades
      },
      profitability: {
        totalProfit: stats.stats.totalProfit,
        totalLoss: stats.stats.totalLoss,
        netProfit: stats.stats.totalProfit - stats.stats.totalLoss,
        profitFactor: stats.stats.profitFactor
      },
      risk: {
        maxDrawdown: stats.stats.maxDrawdown,
        currentDrawdown: stats.stats.currentDrawdown,
        balance: stats.balance,
        highestBalance: stats.stats.highestBalance
      }
    };
    
    res.json({
      success: true,
      data: winrateData
    });
    
  } catch (error) {
    logger.error('Winrate stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Win rate istatistikleri alınamadı'
    });
  }
});

// Recent trades
router.get('/trades', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const stats = simulationService.getPerformanceStats();
    
    const recentTrades = stats.recentTrades || [];
    const limitedTrades = recentTrades.slice(-limit);
    
    res.json({
      success: true,
      data: {
        trades: limitedTrades,
        total: recentTrades.length,
        activeTrades: stats.activeTrades
      }
    });
    
  } catch (error) {
    logger.error('Trades stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Trade geçmişi alınamadı'
    });
  }
});

// Reset simulation (only in simulation mode)
router.post('/reset-simulation', async (req, res) => {
  try {
    if (process.env.SIMULATION_MODE !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'Reset sadece simulation mode\'da kullanılabilir'
      });
    }
    
    await simulationService.resetSimulation();
    
    logger.info('🔄 Simulation reset via API');
    
    res.json({
      success: true,
      message: 'Simulation sıfırlandı'
    });
    
  } catch (error) {
    logger.error('Simulation reset error:', error);
    res.status(500).json({
      success: false,
      error: 'Simulation sıfırlanamadı'
    });
  }
});

// Manual close trade (only in simulation mode)
router.post('/close-trade/:orderId', async (req, res) => {
  try {
    if (process.env.SIMULATION_MODE !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'Manuel kapatma sadece simulation mode\'da kullanılabilir'
      });
    }
    
    const { orderId } = req.params;
    const { reason = 'manual_api' } = req.body;
    
    await simulationService.manualCloseTrade(orderId, reason);
    
    logger.info(`📱 Trade manually closed via API: ${orderId}`);
    
    res.json({
      success: true,
      message: `Trade ${orderId} kapatıldı`
    });
    
  } catch (error) {
    logger.error('Manual close trade error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Filter performance breakdown
router.get('/filters', async (req, res) => {
  try {
    const filterStats = signalProcessor.getFilterStats();
    
    res.json({
      success: true,
      data: filterStats
    });
    
  } catch (error) {
    logger.error('Filter stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Filtre istatistikleri alınamadı'
    });
  }
});

module.exports = router;
