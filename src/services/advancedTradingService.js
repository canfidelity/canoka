const logger = require('../utils/logger');
const configService = require('./configService');
const exchangeService = require('./exchangeService');
const technicalAnalysis = require('./technicalAnalysis');

class AdvancedTradingService {
  constructor() {
    this.trailingStops = new Map(); // orderId -> trailing data
    this.autoCloseTimers = new Map(); // orderId -> timer
  }
  
  /**
   * Auto Close Timeout - Pozisyonu belirlenen süre sonra kapat
   */
  async setupAutoClose(orderId, orderData) {
    const timeoutHours = configService.get('AUTO_CLOSE_TIMEOUT_HOURS');
    
    if (timeoutHours > 0) {
      const timeoutMs = timeoutHours * 60 * 60 * 1000; // Convert to milliseconds
      
      const timer = setTimeout(async () => {
        try {
          await exchangeService.closePosition(orderId, 'auto_timeout');
          this.autoCloseTimers.delete(orderId);
          
          logger.info(`⏰ Auto close executed: ${orderId} after ${timeoutHours}h`);
          
        } catch (error) {
          logger.error(`Auto close failed for ${orderId}:`, error);
        }
      }, timeoutMs);
      
      this.autoCloseTimers.set(orderId, timer);
      
      logger.info(`⏰ Auto close scheduled: ${orderId} in ${timeoutHours}h`);
    }
  }
  
  /**
   * Partial Take Profit - Pozisyonun bir kısmını kârda kapat
   */
  async handlePartialTP(orderId, orderData, currentPrice) {
    const partialTPEnabled = configService.get('PARTIAL_TP_ENABLED');
    const partialTPPercent = configService.get('PARTIAL_TP_PERCENT');
    const tpPercent = configService.get('DEFAULT_TP_PERCENT');
    
    if (!partialTPEnabled) return false;
    
    const { side, entryPrice, quantity } = orderData;
    
    // Partial TP seviyesini hesapla (TP'nin yarısı)
    const partialTPLevel = side === 'buy' 
      ? entryPrice * (1 + (tpPercent / 200)) // TP'nin yarısında
      : entryPrice * (1 - (tpPercent / 200));
    
    // Partial TP tetiklendi mi?
    const partialTriggered = (side === 'buy' && currentPrice >= partialTPLevel) ||
                            (side === 'sell' && currentPrice <= partialTPLevel);
    
    if (partialTriggered && !orderData.partialExecuted) {
      try {
        // Pozisyonun bir kısmını kapat
        const partialQuantity = quantity * (partialTPPercent / 100);
        
        const partialOrder = await exchangeService.exchange.createMarketOrder(
          orderData.symbol,
          side === 'buy' ? 'sell' : 'buy',
          partialQuantity
        );
        
        // Order data'yı güncelle
        orderData.partialExecuted = true;
        orderData.remainingQuantity = quantity - partialQuantity;
        
        logger.trade('partial_tp', {
          orderId,
          symbol: orderData.symbol,
          partialQuantity,
          remainingQuantity: orderData.remainingQuantity,
          price: currentPrice
        });
        
        return true;
        
      } catch (error) {
        logger.error(`Partial TP error for ${orderId}:`, error);
      }
    }
    
    return false;
  }
  
  /**
   * Trailing Stop - Stop loss'u fiyat ilerledikçe takip ettir
   */
  async handleTrailingStop(orderId, orderData, currentPrice) {
    const trailingEnabled = configService.get('TRAILING_STOP_ENABLED');
    const trailingDistance = configService.get('TRAILING_STOP_DISTANCE'); // %
    
    if (!trailingEnabled) return false;
    
    const { side, entryPrice } = orderData;
    
    // Trailing stop data'sını al veya oluştur
    let trailingData = this.trailingStops.get(orderId);
    if (!trailingData) {
      trailingData = {
        highestPrice: side === 'buy' ? currentPrice : entryPrice,
        lowestPrice: side === 'sell' ? currentPrice : entryPrice,
        currentStopPrice: orderData.stopPrice
      };
      this.trailingStops.set(orderId, trailingData);
    }
    
    let stopUpdated = false;
    
    if (side === 'buy') {
      // Long pozisyon - fiyat yükselirken stop'u yukarı çek
      if (currentPrice > trailingData.highestPrice) {
        trailingData.highestPrice = currentPrice;
        
        // Yeni stop price hesapla
        const newStopPrice = currentPrice * (1 - trailingDistance / 100);
        
        if (newStopPrice > trailingData.currentStopPrice) {
          trailingData.currentStopPrice = newStopPrice;
          stopUpdated = true;
        }
      }
      
      // Stop tetiklendi mi?
      if (currentPrice <= trailingData.currentStopPrice) {
        await this.executeTrailingStop(orderId, orderData, currentPrice, 'trailing_stop');
        return true;
      }
      
    } else {
      // Short pozisyon - fiyat düşerken stop'u aşağı çek
      if (currentPrice < trailingData.lowestPrice) {
        trailingData.lowestPrice = currentPrice;
        
        // Yeni stop price hesapla
        const newStopPrice = currentPrice * (1 + trailingDistance / 100);
        
        if (newStopPrice < trailingData.currentStopPrice) {
          trailingData.currentStopPrice = newStopPrice;
          stopUpdated = true;
        }
      }
      
      // Stop tetiklendi mi?
      if (currentPrice >= trailingData.currentStopPrice) {
        await this.executeTrailingStop(orderId, orderData, currentPrice, 'trailing_stop');
        return true;
      }
    }
    
    if (stopUpdated) {
      logger.info(`📈 Trailing stop updated: ${orderId} new stop: $${trailingData.currentStopPrice.toFixed(4)}`);
    }
    
    return false;
  }
  
  /**
   * Trailing stop tetiklendiğinde pozisyonu kapat
   */
  async executeTrailingStop(orderId, orderData, currentPrice, reason) {
    try {
      await exchangeService.closePosition(orderId, reason);
      
      this.trailingStops.delete(orderId);
      this.clearAutoClose(orderId);
      
      logger.trade('trailing_stop_executed', {
        orderId,
        symbol: orderData.symbol,
        exitPrice: currentPrice,
        reason
      });
      
    } catch (error) {
      logger.error(`Trailing stop execution failed for ${orderId}:`, error);
    }
  }
  
  /**
   * DCA (Dollar Cost Averaging) - Tekrar alım sistemi
   */
  async handleDCA(orderId, orderData, currentPrice) {
    const dcaEnabled = configService.get('DCA_ENABLED');
    const maxDCASteps = configService.get('DCA_MAX_STEPS');
    const dcaDistance = configService.get('DCA_DISTANCE_PERCENT');
    
    if (!dcaEnabled || !orderData.dcaSteps) {
      orderData.dcaSteps = 0;
      orderData.lastDCAPrice = orderData.entryPrice;
    }
    
    if (orderData.dcaSteps >= maxDCASteps) return false;
    
    const { side } = orderData;
    
    // DCA tetikleme fiyatını hesapla
    const dcaTriggerPrice = side === 'buy'
      ? orderData.lastDCAPrice * (1 - dcaDistance / 100)
      : orderData.lastDCAPrice * (1 + dcaDistance / 100);
    
    // DCA tetiklendi mi?
    const dcaTriggered = (side === 'buy' && currentPrice <= dcaTriggerPrice) ||
                        (side === 'sell' && currentPrice >= dcaTriggerPrice);
    
    if (dcaTriggered) {
      try {
        const dcaOrder = await exchangeService.createDCAOrder(
          orderData, 
          orderData.dcaSteps + 1, 
          dcaDistance
        );
        
        // DCA bilgilerini güncelle
        orderData.dcaSteps++;
        orderData.lastDCAPrice = currentPrice;
        orderData.totalQuantity += orderData.quantity;
        
        logger.trade('dca_executed', {
          orderId,
          dcaStep: orderData.dcaSteps,
          dcaPrice: currentPrice,
          totalQuantity: orderData.totalQuantity
        });
        
        return true;
        
      } catch (error) {
        logger.error(`DCA execution failed for ${orderId}:`, error);
      }
    }
    
    return false;
  }
  
  /**
   * Advanced features'ı bir arada process et
   */
  async processAdvancedFeatures(orderId, orderData, currentPrice) {
    try {
      // 1. Partial TP kontrolü
      await this.handlePartialTP(orderId, orderData, currentPrice);
      
      // 2. Trailing stop kontrolü
      const trailingClosed = await this.handleTrailingStop(orderId, orderData, currentPrice);
      if (trailingClosed) return true; // Pozisyon kapandı
      
      // 3. DCA kontrolü
      await this.handleDCA(orderId, orderData, currentPrice);
      
      return false;
      
    } catch (error) {
      logger.error(`Advanced features processing error for ${orderId}:`, error);
      return false;
    }
  }
  
  /**
   * Order cleanup
   */
  clearAutoClose(orderId) {
    const timer = this.autoCloseTimers.get(orderId);
    if (timer) {
      clearTimeout(timer);
      this.autoCloseTimers.delete(orderId);
    }
  }
  
  cleanup(orderId) {
    this.trailingStops.delete(orderId);
    this.clearAutoClose(orderId);
  }
  
  /**
   * Advanced trading istatistikleri
   */
  getStats() {
    return {
      activeTrailingStops: this.trailingStops.size,
      activeAutoCloseTimers: this.autoCloseTimers.size,
      features: {
        partialTP: configService.get('PARTIAL_TP_ENABLED'),
        trailingStop: configService.get('TRAILING_STOP_ENABLED'),
        autoClose: configService.get('AUTO_CLOSE_TIMEOUT_HOURS') > 0,
        dca: configService.get('DCA_ENABLED')
      }
    };
  }
}

module.exports = new AdvancedTradingService();
