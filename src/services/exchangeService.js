const ccxt = require('ccxt');
const logger = require('../utils/logger');
const configService = require('./configService');

class ExchangeService {
  constructor() {
    this.exchange = null;
    this.initialized = false;
    this.activeOrders = new Map();
    this.activePositions = new Map();
  }
  
  async initialize() {
    try {
      const apiKey = process.env.BINANCE_API_KEY;
      const secret = process.env.BINANCE_SECRET_KEY;
      const testnet = process.env.BINANCE_TESTNET === 'true';
      
      if (!apiKey || !secret) {
        throw new Error('Binance API keys eksik');
      }
      
      this.exchange = new ccxt.binance({
        apiKey: apiKey,
        secret: secret,
        sandbox: testnet,
        options: {
          defaultType: 'spot' // spot trading
        }
      });
      
      // Bağlantıyı test et
      await this.testConnection();
      
      this.initialized = true;
      logger.info(`Exchange servisi başlatıldı (${testnet ? 'TESTNET' : 'MAINNET'})`);
      
    } catch (error) {
      logger.error('Exchange başlatma hatası:', error);
      throw error;
    }
  }
  
  async testConnection() {
    try {
      const balance = await this.exchange.fetchBalance();
      logger.info('Exchange bağlantısı başarılı', {
        usdt: balance.USDT?.total || 0
      });
      return true;
    } catch (error) {
      throw new Error(`Exchange bağlantı testi başarısız: ${error.message}`);
    }
  }
  
  /**
   * Trade order oluştur (readme.md'ye göre)
   */
  async createOrder(tradeParams) {
    if (!this.initialized) {
      throw new Error('Exchange servisi henüz başlatılmadı');
    }
    
    try {
      const { symbol, side, type, quantity, price, stopPrice, takeProfitPrice } = tradeParams;
      
      logger.info(`Order oluşturuluyor: ${symbol} ${side.toUpperCase()} ${quantity}`, {
        type,
        price,
        stopPrice,
        takeProfitPrice
      });
      
      // Ana order oluştur
      const mainOrder = await this.createMainOrder(tradeParams);
      
      // TP/SL orders oluştur
      const tpSlOrders = await this.createTPSLOrders(mainOrder, tradeParams);
      
      // Order'ı takip et
      this.trackOrder(mainOrder, tpSlOrders);
      
      return {
        success: true,
        id: mainOrder.id,
        mainOrder,
        tpSlOrders,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Order oluşturma hatası:', error);
      throw error;
    }
  }
  
  async createMainOrder(tradeParams) {
    const { symbol, side, type, quantity, price, timeInForce } = tradeParams;
    
    // Market vs Limit order
    if (type === 'market') {
      return await this.exchange.createMarketOrder(symbol, side, quantity);
    } else {
      return await this.exchange.createLimitOrder(symbol, side, quantity, price, undefined, {
        timeInForce: timeInForce || 'GTC'
      });
    }
  }
  
  async createTPSLOrders(mainOrder, tradeParams) {
    const { symbol, side, takeProfitPrice, stopPrice } = tradeParams;
    const orders = {};
    
    try {
      // Take Profit Order
      if (takeProfitPrice) {
        const tpSide = side === 'buy' ? 'sell' : 'buy';
        orders.takeProfit = await this.exchange.createLimitOrder(
          symbol, tpSide, mainOrder.amount, takeProfitPrice
        );
        logger.info(`TP order oluşturuldu: ${takeProfitPrice}`);
      }
      
      // Stop Loss Order
      if (stopPrice) {
        const slSide = side === 'buy' ? 'sell' : 'buy';
        orders.stopLoss = await this.exchange.createStopMarketOrder(
          symbol, slSide, mainOrder.amount, stopPrice
        );
        logger.info(`SL order oluşturuldu: ${stopPrice}`);
      }
      
    } catch (error) {
      logger.warn('TP/SL order oluşturma hatası:', error.message);
      // Ana order başarılı olsa bile TP/SL başarısız olabilir
    }
    
    return orders;
  }
  
  trackOrder(mainOrder, tpSlOrders) {
    const orderInfo = {
      id: mainOrder.id,
      symbol: mainOrder.symbol,
      side: mainOrder.side,
      amount: mainOrder.amount,
      price: mainOrder.price,
      status: mainOrder.status,
      tpSlOrders,
      createdAt: new Date(),
      lastUpdate: new Date()
    };
    
    this.activeOrders.set(mainOrder.id, orderInfo);
    logger.info(`Order takip ediliyor: ${mainOrder.id}`);
  }
  
  /**
   * DCA (Dollar Cost Averaging) order oluştur
   */
  async createDCAOrder(originalOrder, dcaStep, dcaDistance) {
    try {
      const symbol = originalOrder.symbol;
      const side = originalOrder.side;
      const quantity = originalOrder.amount; // Aynı miktar
      
      // DCA fiyatını hesapla
      const dcaPrice = side === 'buy' 
        ? originalOrder.price * (1 - dcaDistance / 100)
        : originalOrder.price * (1 + dcaDistance / 100);
      
      const dcaOrder = await this.exchange.createLimitOrder(symbol, side, quantity, dcaPrice);
      
      logger.trade('dca_created', {
        originalOrderId: originalOrder.id,
        dcaOrderId: dcaOrder.id,
        dcaStep,
        dcaPrice,
        quantity
      });
      
      return dcaOrder;
      
    } catch (error) {
      logger.error('DCA order hatası:', error);
      throw error;
    }
  }
  
  /**
   * Order durumunu kontrol et
   */
  async checkOrderStatus(orderId) {
    try {
      const orderInfo = this.activeOrders.get(orderId);
      if (!orderInfo) {
        throw new Error(`Order bulunamadı: ${orderId}`);
      }
      
      const order = await this.exchange.fetchOrder(orderId, orderInfo.symbol);
      
      // Status güncelle
      orderInfo.status = order.status;
      orderInfo.lastUpdate = new Date();
      
      return order;
      
    } catch (error) {
      logger.error(`Order status kontrol hatası ${orderId}:`, error);
      throw error;
    }
  }
  
  /**
   * Pozisyonu kapat
   */
  async closePosition(orderId, reason = 'manual') {
    try {
      const orderInfo = this.activeOrders.get(orderId);
      if (!orderInfo) {
        throw new Error(`Pozisyon bulunamadı: ${orderId}`);
      }
      
      // Açık orderları iptal et
      if (orderInfo.tpSlOrders.takeProfit) {
        await this.cancelOrder(orderInfo.tpSlOrders.takeProfit.id);
      }
      
      if (orderInfo.tpSlOrders.stopLoss) {
        await this.cancelOrder(orderInfo.tpSlOrders.stopLoss.id);
      }
      
      // Pozisyonu market order ile kapat
      const closeSide = orderInfo.side === 'buy' ? 'sell' : 'buy';
      const closeOrder = await this.exchange.createMarketOrder(
        orderInfo.symbol, 
        closeSide, 
        orderInfo.amount
      );
      
      // Takipten çıkar
      this.activeOrders.delete(orderId);
      
      logger.trade('position_closed', {
        originalOrderId: orderId,
        closeOrderId: closeOrder.id,
        reason
      });
      
      return closeOrder;
      
    } catch (error) {
      logger.error(`Pozisyon kapatma hatası ${orderId}:`, error);
      throw error;
    }
  }
  
  async cancelOrder(orderId) {
    try {
      const result = await this.exchange.cancelOrder(orderId);
      logger.info(`Order iptal edildi: ${orderId}`);
      return result;
    } catch (error) {
      logger.warn(`Order iptal hatası ${orderId}:`, error.message);
      return null;
    }
  }
  
  /**
   * Bakiye sorgula
   */
  async getBalance() {
    try {
      const balance = await this.exchange.fetchBalance();
      return {
        usdt: balance.USDT?.free || 0,
        total: balance.USDT?.total || 0
      };
    } catch (error) {
      logger.error('Bakiye sorgu hatası:', error);
      throw error;
    }
  }
  
  /**
   * Market bilgisi al
   */
  async getMarketInfo(symbol) {
    try {
      const ticker = await this.exchange.fetchTicker(symbol);
      const markets = await this.exchange.loadMarkets();
      const market = markets[symbol];
      
      return {
        symbol,
        price: ticker.last,
        volume: ticker.baseVolume,
        change24h: ticker.percentage,
        minNotional: market.limits.cost.min,
        stepSize: market.precision.amount
      };
    } catch (error) {
      logger.error(`Market bilgi hatası ${symbol}:`, error);
      throw error;
    }
  }
  
  /**
   * Aktif pozisyonlar
   */
  getActiveOrders() {
    return Array.from(this.activeOrders.values());
  }
  
  /**
   * Exchange istatistikleri
   */
  getStats() {
    return {
      activeOrders: this.activeOrders.size,
      initialized: this.initialized,
      exchange: this.exchange?.id || null
    };
  }
}

module.exports = new ExchangeService();
