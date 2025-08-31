const logger = require('../../utils/logger');
const technicalAnalysis = require('../technicalAnalysis');
const configService = require('../configService');

class LocalFilters {
  constructor() {
    this.stats = {
      totalChecks: 0,
      passed: 0,
      failed: 0,
      failReasons: {},
      lastUpdate: null
    };
  }
  
  /**
   * Local coin filtreleri (15m/30m)
   * - EMA200 trend yönü (sinyal yönü ile uyumlu olmalı)
   * - ADX14 > 20 (trend gücü)
   * - rVOL > 1.2 (hacim teyidi)
   * - BB width > 0.01 (flat değil)
   * - Herhangi biri fail → Sinyal Reddedilir
   */
  async check(signalData) {
    this.stats.totalChecks++;
    this.stats.lastUpdate = new Date();
    
    try {
      const { symbol, action, timeframe } = signalData;
      
      logger.info(`Local filtreler kontrol ediliyor: ${symbol} ${timeframe}`);
      
      // Kline data al (200 bar - EMA200 için yeterli)
      const klineData = await technicalAnalysis.getKlineData(symbol, timeframe, 200);
      
      // 1. EMA200 Trend Kontrolü
      const emaCheck = await this.checkEMATrend(klineData, action);
      
      // 2. ADX14 Trend Gücü
      const adxCheck = await this.checkADXStrength(klineData);
      
      // 3. rVOL Hacim Teyidi
      const volumeCheck = await this.checkRelativeVolume(klineData);
      
      // 4. Bollinger Bands Width
      const bbCheck = await this.checkBollingerBandsWidth(klineData);
      
      const filterResults = {
        ema200: emaCheck,
        adx14: adxCheck,
        relativeVolume: volumeCheck,
        bollingerWidth: bbCheck
      };
      
      // Tüm filtreler geçmeli
      const allPassed = Object.values(filterResults).every(result => result.passed);
      
      if (allPassed) {
        this.stats.passed++;
        return {
          passed: true,
          reason: 'Tüm local filtreler başarılı',
          details: filterResults
        };
      } else {
        this.stats.failed++;
        const failedFilters = Object.entries(filterResults)
          .filter(([_, result]) => !result.passed)
          .map(([name, result]) => `${name}: ${result.reason}`)
          .join(', ');
        
        // İstatistik için fail sebeplerini kaydet
        Object.entries(filterResults).forEach(([name, result]) => {
          if (!result.passed) {
            this.stats.failReasons[name] = (this.stats.failReasons[name] || 0) + 1;
          }
        });
        
        return {
          passed: false,
          reason: `Başarısız filtreler: ${failedFilters}`,
          details: filterResults
        };
      }
      
    } catch (error) {
      this.stats.failed++;
      logger.error('Local filters error:', error);
      return {
        passed: false,
        reason: `Local filtre hatası: ${error.message}`,
        details: null
      };
    }
  }
  
  async checkEMATrend(klineData, signalAction) {
    try {
      const ema200 = await technicalAnalysis.calculateEMA(klineData, 200);
      const currentPrice = klineData[klineData.length - 1].close;
      
      const isAboveEMA = currentPrice > ema200;
      const trendDirection = isAboveEMA ? 'BULLISH' : 'BEARISH';
      
      // Sinyal yönü ile trend uyumluluğu
      const isCompatible = (signalAction === 'BUY' && isAboveEMA) || 
                          (signalAction === 'SELL' && !isAboveEMA);
      
      return {
        passed: isCompatible,
        reason: isCompatible ? 
          `EMA200 trend uyumlu (${trendDirection})` : 
          `EMA200 trend uyumsuz - Signal: ${signalAction}, Trend: ${trendDirection}`,
        value: ema200,
        currentPrice,
        trend: trendDirection
      };
      
    } catch (error) {
      return {
        passed: false,
        reason: `EMA200 hesaplama hatası: ${error.message}`,
        value: null
      };
    }
  }
  
  async checkADXStrength(klineData) {
    try {
      const adxThreshold = configService.get('ADX_THRESHOLD'); // Default: 20
      const adx14 = await technicalAnalysis.calculateADX(klineData, 14);
      
      const passed = adx14 > adxThreshold;
      
      return {
        passed,
        reason: passed ? 
          `ADX14 yeterli trend gücü (${adx14.toFixed(2)})` : 
          `ADX14 yetersiz trend gücü (${adx14.toFixed(2)} < ${adxThreshold})`,
        value: adx14,
        threshold: adxThreshold
      };
      
    } catch (error) {
      return {
        passed: false,
        reason: `ADX14 hesaplama hatası: ${error.message}`,
        value: null
      };
    }
  }
  
  async checkRelativeVolume(klineData) {
    try {
      const rvolThreshold = configService.get('RVOL_THRESHOLD'); // Default: 1.2
      const relativeVolume = await technicalAnalysis.calculateRelativeVolume(klineData, 20);
      
      const passed = relativeVolume > rvolThreshold;
      
      return {
        passed,
        reason: passed ? 
          `rVOL yeterli hacim (${relativeVolume.toFixed(2)})` : 
          `rVOL yetersiz hacim (${relativeVolume.toFixed(2)} < ${rvolThreshold})`,
        value: relativeVolume,
        threshold: rvolThreshold
      };
      
    } catch (error) {
      return {
        passed: false,
        reason: `rVOL hesaplama hatası: ${error.message}`,
        value: null
      };
    }
  }
  
  async checkBollingerBandsWidth(klineData) {
    try {
      const bbWidthThreshold = configService.get('BB_WIDTH_THRESHOLD'); // Default: 0.01
      const bbWidth = await technicalAnalysis.calculateBBWidth(klineData, 20, 2);
      
      const passed = bbWidth > bbWidthThreshold;
      
      return {
        passed,
        reason: passed ? 
          `BB width yeterli volatilite (${bbWidth.toFixed(4)})` : 
          `BB width yetersiz volatilite (${bbWidth.toFixed(4)} < ${bbWidthThreshold})`,
        value: bbWidth,
        threshold: bbWidthThreshold
      };
      
    } catch (error) {
      return {
        passed: false,
        reason: `BB width hesaplama hatası: ${error.message}`,
        value: null
      };
    }
  }
  
  getStats() {
    return {
      ...this.stats,
      passRate: this.stats.totalChecks > 0 ? 
        (this.stats.passed / this.stats.totalChecks * 100).toFixed(2) + '%' : '0%',
      topFailReasons: Object.entries(this.stats.failReasons)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([reason, count]) => ({ reason, count }))
    };
  }
}

module.exports = new LocalFilters();
