const logger = require('../utils/logger');
const configService = require('./configService');
const exchangeService = require('./exchangeService');

class RiskManager {
  constructor() {
    this.dailyStats = {
      date: new Date().toDateString(),
      totalLoss: 0,
      totalProfit: 0,
      tradeCount: 0,
      activeTrades: 0
    };
    
    this.coinTradeCount = new Map(); // Her coin için aktif trade sayısı
  }
  
  /**
   * Trade riski kontrol et (readme.md'ye göre)
   */
  async checkTradeRisk(signalData) {
    try {
      const checks = [];
      
      // 1. Maksimum aktif işlem sayısı kontrolü
      checks.push(await this.checkMaxActiveTrades());
      
      // 2. Parite başına maksimum işlem kontrolü
      checks.push(await this.checkMaxTradesPerCoin(signalData.symbol));
      
      // 3. Günlük zarar limiti kontrolü
      checks.push(await this.checkDailyLossLimit());
      
      // 4. Bakiye kontrolü
      checks.push(await this.checkSufficientBalance());
      
      // 5. Market hours kontrolü (opsiyonel)
      checks.push(await this.checkMarketConditions());
      
      // Tüm kontroller başarılı mı?
      const allPassed = checks.every(check => check.passed);
      const failedChecks = checks.filter(check => !check.passed);
      
      if (allPassed) {
        return {
          allowed: true,
          reason: 'Tüm risk kontrolleri başarılı',
          checks
        };
      } else {
        const reasons = failedChecks.map(check => check.reason).join(', ');
        return {
          allowed: false,
          reason: reasons,
          checks
        };
      }
      
    } catch (error) {
      logger.error('Risk kontrolü hatası:', error);
      return {
        allowed: false,
        reason: `Risk kontrolü başarısız: ${error.message}`,
        checks: []
      };
    }
  }
  
  async checkMaxActiveTrades() {
    const maxTrades = configService.get('MAX_ACTIVE_TRADES');
    const activeTrades = exchangeService.getActiveOrders().length;
    
    const passed = activeTrades < maxTrades;
    
    return {
      name: 'max_active_trades',
      passed,
      reason: passed ? 
        `Aktif trade sayısı uygun (${activeTrades}/${maxTrades})` :
        `Maksimum aktif trade limitine ulaşıldı (${activeTrades}/${maxTrades})`,
      current: activeTrades,
      limit: maxTrades
    };
  }
  
  async checkMaxTradesPerCoin(symbol) {
    const maxPerCoin = configService.get('MAX_TRADES_PER_COIN');
    const activeTradesForCoin = exchangeService.getActiveOrders()
      .filter(order => order.symbol === symbol).length;
    
    const passed = activeTradesForCoin < maxPerCoin;
    
    return {
      name: 'max_trades_per_coin',
      passed,
      reason: passed ?
        `${symbol} için trade sayısı uygun (${activeTradesForCoin}/${maxPerCoin})` :
        `${symbol} için maksimum trade limitine ulaşıldı (${activeTradesForCoin}/${maxPerCoin})`,
      current: activeTradesForCoin,
      limit: maxPerCoin,
      symbol
    };
  }
  
  async checkDailyLossLimit() {
    const lossCapPercent = configService.get('DAILY_LOSS_CAP_PERCENT');
    const usdtAmount = configService.get('DEFAULT_USDT_AMOUNT');
    const maxTrades = configService.get('MAX_ACTIVE_TRADES');
    
    // Günlük maksimum risk tutarı
    const dailyRiskLimit = (maxTrades * usdtAmount * lossCapPercent) / 100;
    
    // Bugünkü kayıp miktarını kontrol et
    this.updateDailyStats();
    const currentLoss = this.dailyStats.totalLoss;
    
    const passed = currentLoss < dailyRiskLimit;
    
    return {
      name: 'daily_loss_limit',
      passed,
      reason: passed ?
        `Günlük zarar limiti uygun ($${currentLoss.toFixed(2)}/$${dailyRiskLimit.toFixed(2)})` :
        `Günlük zarar limitine ulaşıldı ($${currentLoss.toFixed(2)}/$${dailyRiskLimit.toFixed(2)})`,
      currentLoss,
      limit: dailyRiskLimit
    };
  }
  
  async checkSufficientBalance() {
    try {
      const balance = await exchangeService.getBalance();
      const requiredAmount = configService.get('DEFAULT_USDT_AMOUNT');
      
      const passed = balance.usdt >= requiredAmount;
      
      return {
        name: 'sufficient_balance',
        passed,
        reason: passed ?
          `Yeterli bakiye ($${balance.usdt.toFixed(2)})` :
          `Yetersiz bakiye ($${balance.usdt.toFixed(2)} < $${requiredAmount})`,
        current: balance.usdt,
        required: requiredAmount
      };
      
    } catch (error) {
      return {
        name: 'sufficient_balance',
        passed: false,
        reason: `Bakiye kontrolü başarısız: ${error.message}`,
        current: 0,
        required: 0
      };
    }
  }
  
  async checkMarketConditions() {
    // Market saatleri, volatilite, spread kontrolü vb.
    const now = new Date();
    const hour = now.getUTCHours();
    
    // Crypto 24/7 ama bazı saatlerde daha az likidite
    const isActiveHours = hour >= 6 && hour <= 22; // UTC
    
    return {
      name: 'market_conditions',
      passed: true, // Crypto için her zaman aktif
      reason: isActiveHours ? 
        'Aktif market saatleri' : 
        'Düşük likidite saatleri (devam edilebilir)',
      hour
    };
  }
  
  /**
   * Trade sonucu kaydet
   */
  recordTradeResult(tradeResult) {
    this.updateDailyStats();
    
    const { pnl, symbol, side, amount } = tradeResult;
    
    this.dailyStats.tradeCount++;
    
    if (pnl > 0) {
      this.dailyStats.totalProfit += pnl;
      logger.info(`💰 Karlı trade: ${symbol} ${side} +$${pnl.toFixed(2)}`);
    } else {
      this.dailyStats.totalLoss += Math.abs(pnl);
      logger.warn(`📉 Zararlı trade: ${symbol} ${side} -$${Math.abs(pnl).toFixed(2)}`);
    }
    
    // Trade sonuçlarını logla
    logger.trade('result', {
      symbol,
      side,
      amount,
      pnl,
      dailyStats: this.dailyStats
    });
  }
  
  /**
   * Günlük istatistikleri güncelle
   */
  updateDailyStats() {
    const today = new Date().toDateString();
    
    // Yeni gün başladıysa stats'ı sıfırla
    if (this.dailyStats.date !== today) {
      logger.info('📊 Yeni gün başladı, istatistikler sıfırlandı');
      this.dailyStats = {
        date: today,
        totalLoss: 0,
        totalProfit: 0,
        tradeCount: 0,
        activeTrades: exchangeService.getActiveOrders().length
      };
    }
    
    this.dailyStats.activeTrades = exchangeService.getActiveOrders().length;
  }
  
  /**
   * Position size hesapla
   */
  calculatePositionSize(signalData, balance) {
    const usdtAmount = configService.get('DEFAULT_USDT_AMOUNT');
    const maxRisk = Math.min(usdtAmount, balance * 0.1); // Maksimum %10 risk
    
    // Stop loss mesafesine göre position size ayarla
    const slPercent = configService.get('DEFAULT_SL_PERCENT') / 100;
    const riskAmount = maxRisk * slPercent;
    
    return {
      usdtAmount: Math.min(usdtAmount, balance * 0.05), // Maksimum %5 pozisyon
      riskAmount,
      maxLoss: riskAmount
    };
  }
  
  /**
   * Risk istatistikleri
   */
  getRiskStats() {
    this.updateDailyStats();
    
    const activeOrders = exchangeService.getActiveOrders();
    const totalExposure = activeOrders.reduce((sum, order) => {
      return sum + (order.amount * order.price || 0);
    }, 0);
    
    return {
      daily: this.dailyStats,
      active: {
        orderCount: activeOrders.length,
        totalExposure: totalExposure.toFixed(2)
      },
      limits: {
        maxActiveTrades: configService.get('MAX_ACTIVE_TRADES'),
        maxTradesPerCoin: configService.get('MAX_TRADES_PER_COIN'),
        dailyLossCapPercent: configService.get('DAILY_LOSS_CAP_PERCENT')
      }
    };
  }
  
  /**
   * Emergency stop - Tüm pozisyonları kapat
   */
  async emergencyStop(reason = 'Emergency stop triggered') {
    logger.warn(`🚨 Emergency stop: ${reason}`);
    
    const activeOrders = exchangeService.getActiveOrders();
    const results = [];
    
    for (const order of activeOrders) {
      try {
        const result = await exchangeService.closePosition(order.id, 'emergency_stop');
        results.push({ orderId: order.id, success: true, result });
      } catch (error) {
        logger.error(`Emergency stop failed for order ${order.id}:`, error);
        results.push({ orderId: order.id, success: false, error: error.message });
      }
    }
    
    return results;
  }
}

module.exports = new RiskManager();
