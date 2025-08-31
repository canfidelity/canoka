const logger = require('../../utils/logger');
const technicalAnalysis = require('../technicalAnalysis');

class GlobalFilter {
  constructor() {
    this.stats = {
      totalChecks: 0,
      passed: 0,
      failed: 0,
      lastUpdate: null
    };
  }
  
  /**
   * Global market filtresi (BTC/ETH – 4h)
   * - EMA200 üstünde → long serbest, short reddet
   * - EMA200 altında → short serbest, long reddet
   */
  async check(signalData) {
    this.stats.totalChecks++;
    this.stats.lastUpdate = new Date();
    
    try {
      const { action } = signalData;
      
      // BTC ve ETH'nin 4h EMA200 durumunu kontrol et
      const btcAnalysis = await this.getGlobalMarketTrend('BTCUSDT', '4h');
      const ethAnalysis = await this.getGlobalMarketTrend('ETHUSDT', '4h');
      
      logger.info('Global market durumu:', {
        BTC: { 
          price: btcAnalysis.currentPrice,
          ema200: btcAnalysis.ema200,
          trend: btcAnalysis.trend
        },
        ETH: { 
          price: ethAnalysis.currentPrice,
          ema200: ethAnalysis.ema200,
          trend: ethAnalysis.trend
        }
      });
      
      // Hem BTC hem ETH'nin trend yönü aynı olmalı
      const marketTrend = this.determineMarketTrend(btcAnalysis, ethAnalysis);
      
      // Signal yönü ile market trend uyumluluğu
      const isCompatible = this.checkSignalCompatibility(action, marketTrend);
      
      if (isCompatible.passed) {
        this.stats.passed++;
        return {
          passed: true,
          reason: isCompatible.reason,
          details: {
            marketTrend,
            btcTrend: btcAnalysis.trend,
            ethTrend: ethAnalysis.trend,
            signalAction: action
          }
        };
      } else {
        this.stats.failed++;
        return {
          passed: false,
          reason: isCompatible.reason,
          details: {
            marketTrend,
            btcTrend: btcAnalysis.trend,
            ethTrend: ethAnalysis.trend,
            signalAction: action
          }
        };
      }
      
    } catch (error) {
      this.stats.failed++;
      logger.error('Global filter error:', error);
      return {
        passed: false,
        reason: `Global filtre hatası: ${error.message}`,
        details: null
      };
    }
  }
  
  async getGlobalMarketTrend(symbol, timeframe) {
    try {
      // Technical analysis servisi ile EMA200 hesapla
      const klineData = await technicalAnalysis.getKlineData(symbol, timeframe, 200);
      const ema200 = await technicalAnalysis.calculateEMA(klineData, 200);
      const currentPrice = klineData[klineData.length - 1].close;
      
      const trend = currentPrice > ema200 ? 'BULLISH' : 'BEARISH';
      
      return {
        symbol,
        currentPrice,
        ema200,
        trend,
        timestamp: new Date()
      };
      
    } catch (error) {
      logger.error(`${symbol} trend analizi hatası:`, error);
      throw error;
    }
  }
  
  determineMarketTrend(btcAnalysis, ethAnalysis) {
    // Her iki majör coin'in trend yönü aynı olmalı
    if (btcAnalysis.trend === ethAnalysis.trend) {
      return btcAnalysis.trend;
    }
    
    // Conflict durumunda BTC'yi öncelikle al
    if (btcAnalysis.trend === 'BULLISH' && ethAnalysis.trend === 'BEARISH') {
      return 'MIXED_BULLISH';
    } else if (btcAnalysis.trend === 'BEARISH' && ethAnalysis.trend === 'BULLISH') {
      return 'MIXED_BEARISH';
    }
    
    return 'NEUTRAL';
  }
  
  checkSignalCompatibility(signalAction, marketTrend) {
    // readme.md'ye göre:
    // EMA200 üstünde → long serbest, short reddet
    // EMA200 altında → short serbest, long reddet
    
    if (marketTrend === 'BULLISH') {
      if (signalAction === 'BUY') {
        return { passed: true, reason: 'Bull market - LONG serbest' };
      } else {
        return { passed: false, reason: 'Bull market - SHORT reddedildi' };
      }
    }
    
    if (marketTrend === 'BEARISH') {
      if (signalAction === 'SELL') {
        return { passed: true, reason: 'Bear market - SHORT serbest' };
      } else {
        return { passed: false, reason: 'Bear market - LONG reddedildi' };
      }
    }
    
    // Mixed durumunda daha katı kontrol
    if (marketTrend === 'MIXED_BULLISH') {
      if (signalAction === 'BUY') {
        return { passed: true, reason: 'Mixed bull - LONG şartlı onay' };
      } else {
        return { passed: false, reason: 'Mixed bull - SHORT reddedildi' };
      }
    }
    
    if (marketTrend === 'MIXED_BEARISH') {
      if (signalAction === 'SELL') {
        return { passed: true, reason: 'Mixed bear - SHORT şartlı onay' };
      } else {
        return { passed: false, reason: 'Mixed bear - LONG reddedildi' };
      }
    }
    
    return { passed: false, reason: 'Market trend belirsiz' };
  }
  
  getStats() {
    return {
      ...this.stats,
      passRate: this.stats.totalChecks > 0 ? 
        (this.stats.passed / this.stats.totalChecks * 100).toFixed(2) + '%' : '0%'
    };
  }
}

module.exports = new GlobalFilter();
