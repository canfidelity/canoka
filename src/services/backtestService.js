const logger = require('../utils/logger');
const technicalAnalysis = require('./technicalAnalysis');
const signalProcessor = require('./signalProcessor');
const configService = require('./configService');
const fs = require('fs').promises;
const path = require('path');

class BacktestService {
  constructor() {
    this.results = {
      startDate: null,
      endDate: null,
      totalSignals: 0,
      approvedSignals: 0,
      rejectedSignals: 0,
      winRate: 0,
      totalProfit: 0,
      totalLoss: 0,
      maxDrawdown: 0,
      trades: [],
      filterStats: {
        globalFilter: { passed: 0, failed: 0 },
        localFilters: { passed: 0, failed: 0 },
        aiFilter: { passed: 0, failed: 0 }
      }
    };
    
    // Test: Constructor'da console.log
    console.log('🔧 BacktestService constructor çalıştı!');
  }
  
  /**
   * Test fonksiyonu
   */
  testFunction() {
    console.log('🧪 Test fonksiyonu çalıştı!');
    return 'Test başarılı!';
  }
  
  /**
   * Belirli zaman aralığında backtest yap
   */
  async runBacktest(options) {
    const {
      symbol = 'ETH-USDT',
      timeframe = '15m',
      startDate = '2024-01-01',
      endDate = '2024-01-31',
      initialBalance = 1000,
      usdtPerTrade = 10
    } = options;
    
    // Debug: Console.log ile test
    console.log('🚀 BACKTEST BAŞLIYOR - CONSOLE.LOG TEST');
    console.log(`🧪 Backtest başlatılıyor: ${symbol} ${timeframe} ${startDate} - ${endDate}`);
    
    logger.info(`🧪 Backtest başlatılıyor: ${symbol} ${timeframe} ${startDate} - ${endDate}`);
    
    try {
      // Tarih aralığını parse et
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      console.log(`📅 Tarih aralığı: ${start} - ${end}`);
      
      this.results.startDate = start;
      this.results.endDate = end;
      
      // Historical kline data çek
      console.log('🔍 Historical data çekiliyor...');
      const klineData = await this.getHistoricalData(symbol, timeframe, start, end);
      
      if (klineData.length === 0) {
        console.log('❌ Historical data bulunamadı!');
        throw new Error('Historical data bulunamadı');
      }
      
      console.log(`✅ ${klineData.length} adet historical bar bulundu`);
      console.log(`📊 İlk bar: ${JSON.stringify(klineData[0])}`);
      console.log(`📊 Son bar: ${JSON.stringify(klineData[klineData.length - 1])}`);
      
      logger.info(`📊 ${klineData.length} adet historical bar bulundu`);
      logger.info(`📊 İlk bar: ${JSON.stringify(klineData[0])}`);
      logger.info(`📊 Son bar: ${JSON.stringify(klineData[klineData.length - 1])}`);
      
      // Data format kontrolü
      if (klineData.length > 0) {
        const sampleBar = klineData[0];
        logger.info(`📊 Sample bar keys: ${Object.keys(sampleBar)}`);
        logger.info(`📊 Sample bar values: ${JSON.stringify(sampleBar)}`);
      }
      
      // Her bar için signal simulation
      let currentBalance = initialBalance;
      let highestBalance = initialBalance;
      let currentDrawdown = 0;
      
      // Loop başlangıç index'ini hesapla (minimum 14 bar gerekli)
      const startIndex = Math.min(14, Math.floor(klineData.length / 2));
      
      logger.info(`🔍 Backtest loop başlıyor: ${klineData.length} bar, ${startIndex}'den başlayarak`);
      
      for (let i = startIndex; i < klineData.length; i++) { // Minimum 14 bar (ATR/MFI için)
        const currentBar = klineData[i];
        const currentPrice = currentBar.close;
        
        // Debug: Her 20 bar'da log
        if (i % 20 === 0) {
          logger.info(`🔍 Loop index ${i}: ${symbol} ${currentPrice}`);
        }
        
        // Signal generation simulation
        const signal = this.generateSignal(symbol, currentBar, i, klineData);
        
        if (signal) {
          // Signal'i process et
          const processResult = await this.processHistoricalSignal(signal, klineData.slice(0, i + 1));
          
          this.results.totalSignals++;
          
          // Filter stats güncelle
          if (processResult.filterResults) {
            if (processResult.filterResults.globalFilter !== undefined) {
              if (processResult.filterResults.globalFilter.passed) {
                this.results.filterStats.globalFilter.passed++;
              } else {
                this.results.filterStats.globalFilter.failed++;
              }
            }
            if (processResult.filterResults.localFilters !== undefined) {
              if (processResult.filterResults.localFilters.passed) {
                this.results.filterStats.localFilters.passed++;
              } else {
                this.results.filterStats.localFilters.failed++;
              }
            }
            if (processResult.filterResults.aiFilter !== undefined) {
              if (processResult.filterResults.aiFilter.passed) {
                this.results.filterStats.aiFilter.passed++;
              } else {
                this.results.filterStats.aiFilter.failed++;
              }
            }
          }
          
          if (processResult.approved) {
            this.results.approvedSignals++;
            
            // Trade simulation - gerçek historical data ile
            const tradeResult = await this.simulateTrade(signal, currentPrice, usdtPerTrade, klineData, i);
            
            if (tradeResult.success) {
              // Balance güncelle
              currentBalance += tradeResult.pnl;
              
              // Drawdown hesapla
              if (currentBalance > highestBalance) {
                highestBalance = currentBalance;
                currentDrawdown = 0;
              } else {
                currentDrawdown = ((highestBalance - currentBalance) / highestBalance) * 100;
                if (currentDrawdown > this.results.maxDrawdown) {
                  this.results.maxDrawdown = currentDrawdown;
                }
              }
              
              // Trade'i kaydet
              this.results.trades.push({
                timestamp: currentBar.openTime,
                symbol: signal.symbol,
                action: signal.action,
                entryPrice: currentPrice,
                exitPrice: tradeResult.exitPrice,
                pnl: tradeResult.pnl,
                balance: currentBalance,
                drawdown: currentDrawdown,
                exitReason: tradeResult.exitReason,
                tpPrice: tradeResult.tpPrice,
                slPrice: tradeResult.slPrice
              });
              
              if (tradeResult.pnl > 0) {
                this.results.totalProfit += tradeResult.pnl;
                logger.info(`💰 Profit added: +$${tradeResult.pnl.toFixed(2)}, Total: $${this.results.totalProfit.toFixed(2)}`);
              } else {
                this.results.totalLoss += Math.abs(tradeResult.pnl);
                logger.info(`💸 Loss added: -$${Math.abs(tradeResult.pnl).toFixed(2)}, Total: $${this.results.totalLoss.toFixed(2)}`);
              }
            }
            
          } else {
            this.results.rejectedSignals++;
            
            // Filter stats güncelle
            if (processResult.filterResults.globalFilter) {
              if (processResult.filterResults.globalFilter.passed) {
                this.results.filterStats.globalFilter.passed++;
              } else {
                this.results.filterStats.globalFilter.failed++;
              }
            }
            
            if (processResult.filterResults.localFilters) {
              if (processResult.filterResults.localFilters.passed) {
                this.results.filterStats.localFilters.passed++;
              } else {
                this.results.filterStats.localFilters.failed++;
              }
            }
          }
        }
      }
      
      // Final stats hesapla
      this.calculateFinalStats();
      
      // Results'ı kaydet
      await this.saveBacktestResults();
      
      logger.info(`✅ Backtest tamamlandı! Win Rate: ${this.results.winRate.toFixed(2)}%`);
      
      return this.results;
      
    } catch (error) {
      logger.error('Backtest error:', error);
      throw error;
    }
  }
  
  /**
   * Historical kline data çek - PAGINATION ile
   */
  async getHistoricalData(symbol, timeframe, startDate, endDate) {
    try {
      logger.info(`🔍 Historical data çekiliyor: ${symbol} ${timeframe} ${startDate} - ${endDate}`);
      
      const axios = require('axios');
      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);
      
      logger.info(`🔍 Timestamps: ${startTimestamp} - ${endTimestamp}`);
      
      // PAGINATION: 7 günlük batch'ler halinde çek
      const batchSize = 7 * 24 * 60 * 60; // 7 gün
      let allData = [];
      
      for (let currentStart = startTimestamp; currentStart < endTimestamp; currentStart += batchSize) {
        const currentEnd = Math.min(currentStart + batchSize, endTimestamp);
        
        logger.info(`🔍 Batch çekiliyor: ${new Date(currentStart * 1000)} - ${new Date(currentEnd * 1000)}`);
        
        try {
          const response = await axios.get('https://api.kucoin.com/api/v1/market/candles', {
            params: {
              symbol: symbol,
              type: this.convertTimeframeToKuCoin(timeframe),
              startAt: currentStart,
              endAt: currentEnd
            }
          });
          
          if (response.data.data && response.data.data.length > 0) {
            const batchData = response.data.data.map(kline => ({
              openTime: parseInt(kline[0]) * 1000,
              open: parseFloat(kline[1]),
              close: parseFloat(kline[2]),
              high: parseFloat(kline[3]),
              low: parseFloat(kline[4]),
              volume: parseFloat(kline[5])
            }));
            
            allData = allData.concat(batchData);
            logger.info(`✅ Batch ${batchData.length} bar eklendi. Toplam: ${allData.length}`);
          }
          
          // Rate limit için bekle
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (batchError) {
          logger.warn(`⚠️ Batch error: ${batchError.message}`);
          continue;
        }
      }
      
      if (allData.length === 0) {
        throw new Error('Hiç historical data alınamadı');
      }
      
      // Data'yı timestamp'e göre sırala
      allData.sort((a, b) => a.openTime - b.openTime);
      
      logger.info(`✅ Toplam ${allData.length} bar alındı (${startDate} - ${endDate})`);
      return allData;
      
    } catch (error) {
      logger.error(`❌ Historical data fetch error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Mock data oluştur (test için)
   */
  generateMockData(startDate, endDate, timeframe) {
    logger.info(`🔄 Mock data oluşturuluyor: ${startDate} - ${endDate} ${timeframe}`);
    
    const data = [];
    const intervalMs = this.getIntervalMs(timeframe);
    let currentTime = startDate.getTime();
    
    logger.info(`🔄 Interval: ${intervalMs}ms`);
    
    while (currentTime <= endDate.getTime()) {
      const basePrice = 1000 + Math.sin(currentTime / 1000000) * 100;
      
      data.push({
        openTime: currentTime,
        open: basePrice,
        close: basePrice + (Math.random() - 0.5) * 20,
        high: basePrice + Math.random() * 30,
        low: basePrice - Math.random() * 30,
        volume: 1000 + Math.random() * 5000
      });
      
      currentTime += intervalMs;
    }
    
    logger.info(`✅ Mock data oluşturuldu: ${data.length} bar`);
    logger.info(`✅ İlk bar: ${JSON.stringify(data[0])}`);
    logger.info(`✅ Son bar: ${JSON.stringify(data[data.length - 1])}`);
    
    return data;
  }
  
  /**
   * Timeframe'i milisaniyeye çevir
   */
  getIntervalMs(timeframe) {
    const mapping = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000
    };
    return mapping[timeframe] || 15 * 60 * 1000;
  }
  
  /**
   * KuCoin timeframe converter
   */
  convertTimeframeToKuCoin(timeframe) {
    const mapping = {
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '1h': '1hour',
      '4h': '4hour',
      '1d': '1day'
    };
    return mapping[timeframe] || '15min';
  }
  
  /**
   * AlphaTrend Signal Generation (TradingView indikatörü)
   */
  generateSignal(symbol, currentBar, index, allData) {
    // Minimum 14 bar gerekli (ATR/MFI hesaplaması için)
    if (index < 14) return null;
    
    const prevBar = allData[index - 1];
    const prevPrevBar = allData[index - 2];
    
    if (!prevBar || !prevPrevBar) return null;
    
    try {
      // Debug: Data format kontrolü
      if (index % 100 === 0) {
        logger.info(`Debug: Index ${index}, Data length: ${allData.length}`);
        logger.info(`Debug: Current bar: ${JSON.stringify(currentBar)}`);
      }
      
      // AlphaTrend parametreleri
      const coeff = 1.0; // Multiplier
      const AP = 14; // Common Period
      
      // ATR hesapla (14 period)
      const atr = this.calculateATR(allData.slice(index - AP + 1, index + 1), AP);
      
      // MFI hesapla (14 period) - trend yönü için
      const mfi = this.calculateMFI(allData.slice(index - AP + 1, index + 1), AP);
      
      // Debug: ATR ve MFI değerleri
      if (index % 100 === 0) {
        logger.info(`Debug: ATR: ${atr}, MFI: ${mfi}`);
      }
      
      // AlphaTrend hesapla (recursive olmadan)
      const alphaTrend = this.calculateAlphaTrendNonRecursive(allData, index, atr, mfi, coeff);
      const alphaTrendPrev = this.calculateAlphaTrendNonRecursive(allData, index - 1, atr, mfi, coeff);
      const alphaTrendPrev2 = this.calculateAlphaTrendNonRecursive(allData, index - 2, atr, mfi, coeff);
      
      // Debug: AlphaTrend değerleri
      if (index % 100 === 0) {
        logger.info(`Debug: AT: ${alphaTrend}, AT-1: ${alphaTrendPrev}, AT-2: ${alphaTrendPrev2}`);
      }
      
      // Signal koşulları
      let signal = null;
      
      // BUY Signal: AlphaTrend crossover (ESKİ BASIT HAL)
      if (alphaTrend > alphaTrendPrev && alphaTrendPrev <= alphaTrendPrev2) {
        signal = {
          strategy: 'AlphaTrend',
          action: 'BUY',
          symbol: symbol,
          timeframe: '15m',
          price: currentBar.close,
          timestamp: currentBar.openTime,
          secret: 'backtest_secret',
          isBacktest: true,
          alphaTrend: alphaTrend,
          alphaTrendPrev: alphaTrendPrev,
          alphaTrendPrev2: alphaTrendPrev2,
          atr: atr,
          mfi: mfi
        };
        
        logger.info(`🚀 BUY Signal generated at index ${index}: AT=${alphaTrend}, AT-1=${alphaTrendPrev}, AT-2=${alphaTrendPrev2}`);
      }
      // SELL Signal: AlphaTrend crossunder (ESKİ BASIT HAL)
      else if (alphaTrend < alphaTrendPrev && alphaTrendPrev >= alphaTrendPrev2) {
        signal = {
          strategy: 'AlphaTrend',
          action: 'SELL',
          symbol: symbol,
          timeframe: '15m',
          price: currentBar.close,
          timestamp: currentBar.openTime,
          secret: 'backtest_secret',
          isBacktest: true,
          alphaTrend: alphaTrend,
          alphaTrendPrev: alphaTrendPrev,
          alphaTrendPrev2: alphaTrendPrev2,
          atr: atr,
          mfi: mfi
        };
        
        logger.info(`🔻 SELL Signal generated at index ${index}: AT=${alphaTrend}, AT-1=${alphaTrendPrev}, AT-2=${alphaTrendPrev2}`);
      }
      
      return signal;
      
    } catch (error) {
      logger.error('AlphaTrend signal generation error:', error);
      return null;
    }
  }
  
  /**
   * ATR (Average True Range) hesapla
   */
  calculateATR(klineData, period) {
    if (klineData.length < period) return 0;
    
    let sum = 0;
    for (let i = 1; i < klineData.length; i++) {
      const high = klineData[i].high;
      const low = klineData[i].low;
      const prevClose = klineData[i - 1].close;
      
      const tr1 = high - low;
      const tr2 = Math.abs(high - prevClose);
      const tr3 = Math.abs(low - prevClose);
      
      sum += Math.max(tr1, tr2, tr3);
    }
    
    return sum / period;
  }
  
  /**
   * MFI (Money Flow Index) hesapla
   */
  calculateMFI(klineData, period) {
    if (klineData.length < period) return 50;
    
    let positiveFlow = 0;
    let negativeFlow = 0;
    
    for (let i = 1; i < klineData.length; i++) {
      const current = klineData[i];
      const prev = klineData[i - 1];
      
      const typicalPrice = (current.high + current.low + current.close) / 3;
      const prevTypicalPrice = (prev.high + prev.low + prev.close) / 3;
      
      if (typicalPrice > prevTypicalPrice) {
        positiveFlow += typicalPrice * current.volume;
      } else if (typicalPrice < prevTypicalPrice) {
        negativeFlow += typicalPrice * current.volume;
      }
    }
    
    if (negativeFlow === 0) return 100;
    
    const mfi = 100 - (100 / (1 + (positiveFlow / negativeFlow)));
    return mfi;
  }
  
  /**
   * AlphaTrend değerini hesapla (recursive olmadan)
   */
  calculateAlphaTrendNonRecursive(allData, index, atr, mfi, coeff) {
    if (index < 1) return 0;
    
    const currentBar = allData[index];
    
    // Basit başlangıç değeri
    let prevAlphaTrend = 0;
    if (index > 0) {
      const prevBar = allData[index - 1];
      prevAlphaTrend = (prevBar.high + prevBar.low) / 2; // Basit ortalama
    }
    
    const upT = currentBar.low - atr * coeff;
    const downT = currentBar.high + atr * coeff;
    
    // MFI >= 50 ise bullish trend
    if (mfi >= 50) {
      return upT < prevAlphaTrend ? prevAlphaTrend : upT;
    } else {
      return downT > prevAlphaTrend ? prevAlphaTrend : downT;
    }
  }
  
  /**
   * AlphaTrend değerini hesapla (recursive - eski versiyon)
   */
  calculateAlphaTrend(allData, index, atr, mfi, coeff) {
    if (index < 1) return 0;
    
    const currentBar = allData[index];
    const prevAlphaTrend = this.calculateAlphaTrend(allData, index - 1, atr, mfi, coeff);
    
    const upT = currentBar.low - atr * coeff;
    const downT = currentBar.high + atr * coeff;
    
    // MFI >= 50 ise bullish trend
    if (mfi >= 50) {
      return upT < prevAlphaTrend ? prevAlphaTrend : upT;
    } else {
      return downT > prevAlphaTrend ? prevAlphaTrend : downT;
    }
  }
  
  /**
   * Historical signal processing
   */
  async processHistoricalSignal(signal, historicalData) {
    try {
      // Technical analysis data'yı historical data'dan al
      const currentData = historicalData[historicalData.length - 1];
      
      // Signal'i process et (filtrelerle)
      const processResult = await signalProcessor.processSignal(signal);
      
      return processResult;
      
    } catch (error) {
      logger.error('Historical signal processing error:', error);
      return { approved: false, reason: 'Processing error' };
    }
  }
  
  /**
   * Trade simulation - gerçek historical data ile TP/SL hit detection
   */
  async simulateTrade(signal, entryPrice, usdtAmount, historicalData, entryIndex) {
    try {
      const quantity = usdtAmount / entryPrice;
      const tpPercent = configService.get('DEFAULT_TP_PERCENT'); // Zaten % cinsinden
      const slPercent = configService.get('DEFAULT_SL_PERCENT'); // Zaten % cinsinden
      
      // TP/SL fiyatları hesapla (% cinsinden)
      const tpPrice = signal.action === 'BUY' 
        ? entryPrice * (1 + tpPercent / 100)
        : entryPrice * (1 - tpPercent / 100);
        
      const slPrice = signal.action === 'BUY'
        ? entryPrice * (1 - slPercent / 100)
        : entryPrice * (1 + slPercent / 100);
      
      logger.info(`🎯 TP/SL Levels: Entry=$${entryPrice} TP=$${tpPrice.toFixed(2)} SL=$${slPrice.toFixed(2)}`);
      
      // Gerçek historical data ile TP/SL hit detection
      let exitPrice, exitReason, pnl;
      
      // Entry sonrası historical data'da TP/SL hit ara
      for (let i = entryIndex + 1; i < historicalData.length; i++) {
        const candle = historicalData[i];
        
        if (signal.action === 'BUY') {
          // LONG position için
          if (candle.high >= tpPrice) {
            exitPrice = tpPrice;
            exitReason = 'TP_HIT';
            logger.info(`🎯 TP_HIT: Entry=$${entryPrice}, TP=$${tpPrice}, Candle High=$${candle.high}`);
            break;
          } else if (candle.low <= slPrice) {
            exitPrice = slPrice;
            exitReason = 'SL_HIT';
            logger.info(`🛑 SL_HIT: Entry=$${entryPrice}, SL=$${slPrice}, Candle Low=$${candle.low}`);
            break;
          }
        } else {
          // SHORT position için (SELL signal)
          if (candle.low <= tpPrice) {
            exitPrice = tpPrice;
            exitReason = 'TP_HIT';
            logger.info(`🎯 TP_HIT: Entry=$${entryPrice}, TP=$${tpPrice}, Candle Low=$${candle.low}`);
            break;
          } else if (candle.high >= slPrice) {
            exitPrice = slPrice;
            exitReason = 'SL_HIT';
            logger.info(`🛑 SL_HIT: Entry=$${entryPrice}, SL=$${slPrice}, Candle High=$${candle.high}`);
            break;
          }
        }
      }
      
      // Eğer TP/SL hit olmadıysa, son fiyattan çık
      if (!exitPrice) {
        exitPrice = historicalData[historicalData.length - 1].close;
        exitReason = 'END_OF_DATA';
        
        // END_OF_DATA için debug logging
        logger.info(`📊 END_OF_DATA: Entry=$${entryPrice}, Exit=$${exitPrice}, Qty=${quantity.toFixed(6)}`);
      }
      
      // P&L hesapla - DOĞRU FORMÜL
      if (signal.action === 'BUY') {
        // LONG position: (exit - entry) * quantity
        pnl = (exitPrice - entryPrice) * quantity;
      } else {
        // SHORT position: (entry - exit) * quantity  
        pnl = (entryPrice - exitPrice) * quantity;
      }
      
      // Debug logging
      logger.info(`💰 P&L Debug: Entry=$${entryPrice}, Exit=$${exitPrice}, Qty=${quantity.toFixed(6)}, P&L=$${pnl.toFixed(2)}`);
      
      logger.info(`📊 Trade Result: ${exitReason} at $${exitPrice.toFixed(2)}, P&L: $${pnl.toFixed(2)}`);
      
      return {
        success: true,
        entryPrice,
        exitPrice,
        quantity,
        pnl,
        tpPrice,
        slPrice,
        exitReason
      };
      
    } catch (error) {
      logger.error('Trade simulation error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Final stats hesapla
   */
  calculateFinalStats() {
    // Win rate = Kazanan trade sayısı / Toplam trade sayısı
    const winningTrades = this.results.trades.filter(trade => trade.pnl > 0).length;
    const totalTrades = this.results.trades.length;
    
    if (totalTrades > 0) {
      this.results.winRate = (winningTrades / totalTrades) * 100;
      logger.info(`📊 Win Rate Calculation: ${winningTrades}/${totalTrades} = ${this.results.winRate.toFixed(2)}%`);
    }
    
    // Filter success rates
    if (this.results.filterStats.globalFilter.passed + this.results.filterStats.globalFilter.failed > 0) {
      this.results.filterStats.globalFilter.successRate = 
        (this.results.filterStats.globalFilter.passed / 
         (this.results.filterStats.globalFilter.passed + this.results.filterStats.globalFilter.failed)) * 100;
    }
    
    if (this.results.filterStats.localFilters.passed + this.results.filterStats.localFilters.failed > 0) {
      this.results.filterStats.localFilters.successRate = 
        (this.results.filterStats.localFilters.passed / 
         (this.results.filterStats.localFilters.passed + this.results.filterStats.localFilters.failed)) * 100;
    }
  }
  
  /**
   * Backtest results'ı kaydet
   */
  async saveBacktestResults() {
    try {
      const filePath = path.join(__dirname, '../../logs/backtest_results.json');
      const data = {
        ...this.results,
        timestamp: new Date().toISOString(),
        config: {
          usdtPerTrade: configService.get('DEFAULT_USDT_AMOUNT'),
          tpPercent: configService.get('DEFAULT_TP_PERCENT'),
          slPercent: configService.get('DEFAULT_SL_PERCENT'),
          adxThreshold: configService.get('ADX_THRESHOLD'),
          rvolThreshold: configService.get('RVOL_THRESHOLD')
        }
      };
      
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      logger.info('📊 Backtest results saved to logs/backtest_results.json');
      
    } catch (error) {
      logger.error('Backtest results save error:', error);
    }
  }
  
  /**
   * Backtest results'ı getir
   */
  async getBacktestResults() {
    try {
      const filePath = path.join(__dirname, '../../logs/backtest_results.json');
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Backtest istatistikleri
   */
  getStats() {
    return {
      totalSignals: this.results.totalSignals,
      approvedSignals: this.results.approvedSignals,
      rejectedSignals: this.results.rejectedSignals,
      winRate: this.results.winRate.toFixed(2) + '%',
      totalProfit: this.results.totalProfit.toFixed(2),
      totalLoss: this.results.totalLoss.toFixed(2),
      maxDrawdown: this.results.maxDrawdown.toFixed(2) + '%',
      filterStats: this.results.filterStats
    };
  }
}

module.exports = new BacktestService();
