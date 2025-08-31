const logger = require('../utils/logger');
const signalProcessor = require('../services/signalProcessor');
const telegramService = require('../services/telegramService');

class WebhookController {
  async processTradingViewSignal(signalData) {
    const startTime = Date.now();
    
    try {
      logger.signal('received', {
        symbol: signalData.symbol,
        action: signalData.action,
        price: signalData.price,
        timeframe: signalData.timeframe
      });
      
      // 1. Signal'i işle ve filtrelerden geçir
      const processResult = await signalProcessor.processSignal(signalData);
      
      // 2. Sonuca göre aksiyon al
      if (processResult.approved) {
        logger.signal('approved', {
          symbol: signalData.symbol,
          action: signalData.action,
          reason: processResult.reason,
          filters: processResult.filterResults
        });
        
        // Trade açma işlemi
        const tradeResult = await this.executeTradeSignal(processResult);
        
        // Telegram bildirimi
        await telegramService.sendTradeNotification({
          type: 'SIGNAL_APPROVED',
          signal: signalData,
          processResult,
          tradeResult
        });
        
        return {
          status: 'approved',
          trade: tradeResult,
          processingTime: Date.now() - startTime
        };
        
      } else {
        logger.signal('rejected', {
          symbol: signalData.symbol,
          action: signalData.action,
          reason: processResult.reason,
          filters: processResult.filterResults
        });
        
        // Red bildirimi (opsiyonel)
        if (process.env.NOTIFY_REJECTIONS === 'true') {
          await telegramService.sendTradeNotification({
            type: 'SIGNAL_REJECTED',
            signal: signalData,
            processResult
          });
        }
        
        return {
          status: 'rejected',
          reason: processResult.reason,
          processingTime: Date.now() - startTime
        };
      }
      
    } catch (error) {
      logger.error('Signal processing error:', error);
      
      // Hata bildirimi
      await telegramService.sendErrorNotification({
        error: error.message,
        signal: signalData
      });
      
      throw error;
    }
  }
  
  async executeTradeSignal(processResult) {
    try {
      const exchangeService = require('../services/exchangeService');
      const riskManager = require('../services/riskManager');
      
      // Risk kontrolü
      const riskCheck = await riskManager.checkTradeRisk(processResult.signal);
      if (!riskCheck.allowed) {
        throw new Error(`Risk kontrolü başarısız: ${riskCheck.reason}`);
      }
      
      // Trade parametrelerini hesapla
      const tradeParams = await this.calculateTradeParams(processResult);
      
      // Exchange'de order oluştur
      const orderResult = await exchangeService.createOrder(tradeParams);
      
      logger.trade('created', {
        symbol: processResult.signal.symbol,
        side: processResult.signal.action,
        params: tradeParams,
        orderId: orderResult.id
      });
      
      return {
        success: true,
        orderId: orderResult.id,
        params: tradeParams
      };
      
    } catch (error) {
      logger.error('Trade execution error:', error);
      throw error;
    }
  }
  
  async calculateTradeParams(processResult) {
    const signal = processResult.signal;
    const config = require('../services/configService');
    
    // Temel parametreler
    const usdtAmount = config.get('DEFAULT_USDT_AMOUNT');
    const tpPercent = config.get('DEFAULT_TP_PERCENT');
    const slPercent = config.get('DEFAULT_SL_PERCENT');
    
    // Entry price hesapla
    const entryDistance = config.get('ENTRY_DISTANCE_PERCENT') || 0;
    const entryPrice = signal.action === 'BUY' 
      ? signal.price * (1 - entryDistance / 100)
      : signal.price * (1 + entryDistance / 100);
    
    // Quantity hesapla
    const quantity = usdtAmount / entryPrice;
    
    // TP/SL hesapla
    const tpPrice = signal.action === 'BUY'
      ? entryPrice * (1 + tpPercent / 100)
      : entryPrice * (1 - tpPercent / 100);
      
    const slPrice = signal.action === 'BUY'
      ? entryPrice * (1 - slPercent / 100)
      : entryPrice * (1 + slPercent / 100);
    
    return {
      symbol: signal.symbol,
      side: signal.action.toLowerCase(),
      type: entryDistance > 0 ? 'limit' : 'market',
      quantity: quantity,
      price: entryDistance > 0 ? entryPrice : undefined,
      stopPrice: slPrice,
      takeProfitPrice: tpPrice,
      timeInForce: 'GTC'
    };
  }
}

module.exports = new WebhookController();
