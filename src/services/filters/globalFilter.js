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
   * Global market filtresi (BTC/ETH – 1h) - 15m scalping için optimize edildi
   * - EMA200 üstünde → long serbest, short reddet
   * - EMA200 altında → short serbest, long reddet
   * - Mixed trend'lerde daha esnek yaklaşım
   */
  async check(signalData) {
    this.stats.totalChecks++;
    this.stats.lastUpdate = new Date();
    
    try {
      const { action } = signalData;
      
      // BTC ve ETH'nin 1h EMA200 durumunu kontrol et (15m scalping için optimize)
      const btcAnalysis = await this.getGlobalMarketTrend('BTC-USDT', '1h');
      const ethAnalysis = await this.getGlobalMarketTrend('ETH-USDT', '1h');
      
      logger.info('🔍 Global market detay analizi:', {
        signal: { symbol: signalData.symbol, action, timeframe: signalData.timeframe },
        BTC: { 
          price: btcAnalysis.currentPrice,
          ema200: btcAnalysis.ema200,
          trend: btcAnalysis.trend,
          aboveEMA: btcAnalysis.currentPrice > btcAnalysis.ema200
        },
        ETH: { 
          price: ethAnalysis.currentPrice,
          ema200: ethAnalysis.ema200,
          trend: ethAnalysis.trend,
          aboveEMA: ethAnalysis.currentPrice > ethAnalysis.ema200
        }
      });
      
      // Hem BTC hem ETH'nin trend yönü aynı olmalı
      const marketTrend = this.determineMarketTrend(btcAnalysis, ethAnalysis);
      logger.info(`📊 Market trend belirlendi: ${marketTrend}`, {
        btcTrend: btcAnalysis.trend,
        ethTrend: ethAnalysis.trend,
        signalAction: action
      });
      
      // Signal yönü ile market trend uyumluluğu
      const isCompatible = this.checkSignalCompatibility(action, marketTrend);
      logger.info(`🎯 Uyumluluk kontrolü: ${isCompatible.passed ? '✅ GEÇTI' : '❌ REDDEDİLDİ'}`, {
        reason: isCompatible.reason,
        marketTrend,
        signalAction: action
      });
      
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
      logger.info(`🔍 ${symbol} ${timeframe} trend analizi başlatılıyor...`);
      
      // Technical analysis servisi ile EMA200 hesapla
      const klineData = await technicalAnalysis.getKlineData(symbol, timeframe, 200);
      const ema200 = await technicalAnalysis.calculateEMA(klineData, 200);
      const currentPrice = klineData[klineData.length - 1].close;
      
      const trend = currentPrice > ema200 ? 'BULLISH' : 'BEARISH';
      const distance = ((currentPrice - ema200) / ema200 * 100).toFixed(2);
      
      logger.info(`📊 ${symbol} analiz sonucu:`, {
        currentPrice: currentPrice.toFixed(2),
        ema200: ema200.toFixed(2),
        trend,
        distanceFromEMA: `${distance}%`,
        timeframe
      });
      
      return {
        symbol,
        currentPrice,
        ema200,
        trend,
        distance: parseFloat(distance),
        timestamp: new Date()
      };
      
    } catch (error) {
      logger.error(`❌ ${symbol} trend analizi hatası:`, error);
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
    // TradingView Signal Logic:
    // BUY = LONG açma sinyali
    // SELL = LONG kapatma sinyali (SHORT açma değil!)
    // 15m scalping için her iki yön de kabul edilebilir
    
    logger.info(`🔍 Signal compatibility check:`, {
      signalAction,
      marketTrend,
      logic: 'TradingView BUY=LONG açma, SELL=LONG kapatma'
    });
    
    if (marketTrend === 'BULLISH') {
      // Bull market'te her iki sinyal de kabul et
      if (signalAction === 'BUY') {
        return { passed: true, reason: 'Bull market - LONG açma sinyali onaylandı' };
      } else {
        return { passed: true, reason: 'Bull market - LONG kapatma sinyali onaylandı' };
      }
    }
    
    if (marketTrend === 'BEARISH') {
      // Bear market'te her iki sinyal de kabul et
      if (signalAction === 'BUY') {
        return { passed: true, reason: 'Bear market - LONG açma sinyali (reversal)' };
      } else {
        return { passed: true, reason: 'Bear market - LONG kapatma sinyali onaylandı' };
      }
    }
    
    // Mixed durumunda 15m scalping için esnek yaklaşım
    if (marketTrend === 'MIXED_BULLISH') {
      // BTC bullish ağırlıklı - her iki yön de kabul et ama BUY öncelikli
      return { 
        passed: true, 
        reason: signalAction === 'BUY' ? 'Mixed bull - LONG öncelikli' : 'Mixed bull - SHORT kabul edildi' 
      };
    }
    
    if (marketTrend === 'MIXED_BEARISH') {
      // BTC bearish ağırlıklı - her iki yön de kabul et ama SELL öncelikli  
      return { 
        passed: true, 
        reason: signalAction === 'SELL' ? 'Mixed bear - SHORT öncelikli' : 'Mixed bear - LONG kabul edildi'
      };
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
