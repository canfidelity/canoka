const axios = require('axios');
const logger = require('../utils/logger');

class TechnicalAnalysis {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 dakika cache
  }
  
  /**
   * Binance'den kline data çek
   */
  async getKlineData(symbol, interval, limit = 200) {
    const cacheKey = `${symbol}_${interval}_${limit}`;
    
    // Cache kontrol et
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }
    
    try {
      const response = await axios.get('https://api.binance.com/api/v3/klines', {
        params: {
          symbol: symbol,
          interval: interval,
          limit: limit
        },
        timeout: 5000
      });
      
      const klineData = response.data.map(kline => ({
        openTime: parseInt(kline[0]),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
        closeTime: parseInt(kline[6])
      }));
      
      // Cache'e kaydet
      this.cache.set(cacheKey, {
        data: klineData,
        timestamp: Date.now()
      });
      
      return klineData;
      
    } catch (error) {
      logger.error(`Kline data çekme hatası ${symbol}:`, error.message);
      throw new Error(`${symbol} için market verisi alınamadı`);
    }
  }
  
  /**
   * EMA (Exponential Moving Average) hesapla
   */
  async calculateEMA(klineData, period) {
    if (klineData.length < period) {
      throw new Error(`EMA hesabı için yetersiz veri: ${klineData.length} < ${period}`);
    }
    
    const closes = klineData.map(k => k.close);
    const multiplier = 2 / (period + 1);
    
    // İlk EMA = SMA
    let ema = closes.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
    
    // Sonraki EMA değerleri
    for (let i = period; i < closes.length; i++) {
      ema = (closes[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }
  
  /**
   * ADX (Average Directional Index) hesapla
   */
  async calculateADX(klineData, period = 14) {
    if (klineData.length < period * 2) {
      throw new Error(`ADX hesabı için yetersiz veri: ${klineData.length} < ${period * 2}`);
    }
    
    const highs = klineData.map(k => k.high);
    const lows = klineData.map(k => k.low);
    const closes = klineData.map(k => k.close);
    
    // True Range hesapla
    const tr = [];
    for (let i = 1; i < klineData.length; i++) {
      const hl = highs[i] - lows[i];
      const hc = Math.abs(highs[i] - closes[i - 1]);
      const lc = Math.abs(lows[i] - closes[i - 1]);
      tr.push(Math.max(hl, hc, lc));
    }
    
    // +DM ve -DM hesapla
    const plusDM = [];
    const minusDM = [];
    
    for (let i = 1; i < highs.length; i++) {
      const highMove = highs[i] - highs[i - 1];
      const lowMove = lows[i - 1] - lows[i];
      
      if (highMove > lowMove && highMove > 0) {
        plusDM.push(highMove);
      } else {
        plusDM.push(0);
      }
      
      if (lowMove > highMove && lowMove > 0) {
        minusDM.push(lowMove);
      } else {
        minusDM.push(0);
      }
    }
    
    // Smoothed averages
    const smoothedTR = this.calculateSmoothedAverage(tr, period);
    const smoothedPlusDM = this.calculateSmoothedAverage(plusDM, period);
    const smoothedMinusDM = this.calculateSmoothedAverage(minusDM, period);
    
    // +DI ve -DI
    const plusDI = (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = (smoothedMinusDM / smoothedTR) * 100;
    
    // DX
    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
    
    // ADX (DX'in smoothed average'i)
    return dx; // Basitleştirilmiş ADX
  }
  
  calculateSmoothedAverage(data, period) {
    if (data.length < period) return 0;
    
    // İlk değer = SMA
    let smoothed = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    
    // Sonraki değerler = (önceki_smoothed * (period - 1) + yeni_değer) / period
    for (let i = period; i < data.length; i++) {
      smoothed = (smoothed * (period - 1) + data[i]) / period;
    }
    
    return smoothed;
  }
  
  /**
   * Relative Volume hesapla
   */
  async calculateRelativeVolume(klineData, period = 20) {
    if (klineData.length < period + 1) {
      throw new Error(`rVOL hesabı için yetersiz veri: ${klineData.length} < ${period + 1}`);
    }
    
    const volumes = klineData.map(k => k.volume);
    const currentVolume = volumes[volumes.length - 1];
    
    // Son N periyodun ortalama hacmi (current hariç)
    const avgVolume = volumes.slice(-period - 1, -1).reduce((sum, vol) => sum + vol, 0) / period;
    
    return currentVolume / avgVolume;
  }
  
  /**
   * Bollinger Bands Width hesapla
   */
  async calculateBBWidth(klineData, period = 20, stdDev = 2) {
    if (klineData.length < period) {
      throw new Error(`BB Width hesabı için yetersiz veri: ${klineData.length} < ${period}`);
    }
    
    const closes = klineData.slice(-period).map(k => k.close);
    
    // SMA hesapla
    const sma = closes.reduce((sum, price) => sum + price, 0) / period;
    
    // Standard deviation hesapla
    const variance = closes.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    // Bollinger Bands
    const upperBand = sma + (std * stdDev);
    const lowerBand = sma - (std * stdDev);
    
    // Width = (Upper Band - Lower Band) / Middle Band
    const width = (upperBand - lowerBand) / sma;
    
    return width;
  }
  
  /**
   * Cache temizle
   */
  clearCache() {
    this.cache.clear();
    logger.info('Technical analysis cache temizlendi');
  }
  
  /**
   * Cache istatistikleri
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      timeout: this.cacheTimeout
    };
  }
}

module.exports = new TechnicalAnalysis();
