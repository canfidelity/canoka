const cron = require('node-cron');
const logger = require('./logger');
const telegramService = require('../services/telegramService');
const exchangeService = require('../services/exchangeService');
const riskManager = require('../services/riskManager');
const technicalAnalysis = require('../services/technicalAnalysis');

class CronJobs {
  constructor() {
    this.jobs = new Map();
  }
  
  /**
   * Tüm cron job'ları başlat
   */
  initializeAll() {
    try {
      // Her 5 dakikada bir order status kontrolü
      this.scheduleOrderMonitoring();
      
      // Günlük özet raporu (her gün 23:59)
      this.scheduleDailyReport();
      
      // Teknik analiz cache temizleme (her saatte)
      this.scheduleCacheClear();
      
      // Order timeout kontrolü (her dakika)
      this.scheduleOrderTimeoutCheck();
      
      logger.info('🕒 Tüm cron job\'ları başlatıldı');
      
    } catch (error) {
      logger.error('Cron job başlatma hatası:', error);
    }
  }
  
  /**
   * Order monitoring - Her 5 dakikada
   */
  scheduleOrderMonitoring() {
    const job = cron.schedule('*/5 * * * *', async () => {
      try {
        await this.monitorActiveOrders();
      } catch (error) {
        logger.error('Order monitoring hatası:', error);
      }
    });
    
    this.jobs.set('order_monitoring', job);
    logger.info('📊 Order monitoring job başlatıldı (her 5 dakika)');
  }
  
  async monitorActiveOrders() {
    const activeOrders = exchangeService.getActiveOrders();
    
    if (activeOrders.length === 0) return;
    
    logger.info(`🔍 ${activeOrders.length} aktif order kontrol ediliyor...`);
    
    for (const orderInfo of activeOrders) {
      try {
        const order = await exchangeService.checkOrderStatus(orderInfo.id);
        
        if (order.status === 'filled') {
          await this.handleFilledOrder(orderInfo, order);
        } else if (order.status === 'canceled') {
          await this.handleCanceledOrder(orderInfo, order);
        }
        
      } catch (error) {
        logger.error(`Order ${orderInfo.id} kontrol hatası:`, error);
      }
    }
  }
  
  async handleFilledOrder(orderInfo, order) {
    logger.trade('filled', {
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      amount: order.amount,
      price: order.price
    });
    
    // PnL hesapla (basitleştirilmiş)
    const pnl = this.calculatePnL(orderInfo, order);
    
    // Risk manager'a bildir
    riskManager.recordTradeResult({
      symbol: order.symbol,
      side: order.side,
      amount: order.amount,
      pnl
    });
    
    // Telegram bildirimi
    await telegramService.sendMessage(`
🎯 <b>ORDER FILLED</b>

📊 <b>Coin:</b> ${order.symbol}
${order.side === 'buy' ? '🟢' : '🔴'} <b>Side:</b> ${order.side.toUpperCase()}
💰 <b>Fiyat:</b> $${order.price}
📦 <b>Miktar:</b> ${order.amount}
💵 <b>P&L:</b> $${pnl.toFixed(2)}

⏱ <b>Zaman:</b> ${new Date().toLocaleString('tr-TR')}
    `.trim());
  }
  
  async handleCanceledOrder(orderInfo, order) {
    logger.trade('canceled', {
      orderId: order.id,
      symbol: order.symbol,
      reason: 'order_canceled'
    });
    
    await telegramService.sendMessage(`
❌ <b>ORDER CANCELED</b>

📊 <b>Coin:</b> ${order.symbol}
🎯 <b>Side:</b> ${order.side.toUpperCase()}
💰 <b>Fiyat:</b> $${order.price}

⏱ <b>Zaman:</b> ${new Date().toLocaleString('tr-TR')}
    `.trim());
  }
  
  calculatePnL(orderInfo, order) {
    // Basitleştirilmiş PnL hesabı
    // Gerçek uygulamada entry/exit fiyatları karşılaştırılır
    return 0; // Placeholder
  }
  
  /**
   * Günlük rapor - Her gün 23:59
   */
  scheduleDailyReport() {
    const job = cron.schedule('59 23 * * *', async () => {
      try {
        await this.sendDailyReport();
      } catch (error) {
        logger.error('Günlük rapor hatası:', error);
      }
    });
    
    this.jobs.set('daily_report', job);
    logger.info('📈 Günlük rapor job başlatıldı (23:59)');
  }
  
  async sendDailyReport() {
    const riskStats = riskManager.getRiskStats();
    const activeOrders = exchangeService.getActiveOrders();
    
    const stats = {
      totalSignals: riskStats.daily.tradeCount,
      approvedSignals: riskStats.daily.tradeCount,
      rejectedSignals: 0, // Bu veri signal processor'dan gelmeli
      winRate: riskStats.daily.tradeCount > 0 ? 
        ((riskStats.daily.totalProfit / (riskStats.daily.totalProfit + riskStats.daily.totalLoss)) * 100).toFixed(2) : 0,
      totalPnl: (riskStats.daily.totalProfit - riskStats.daily.totalLoss).toFixed(2),
      winningTrades: 0, // Hesaplanmalı
      losingTrades: 0   // Hesaplanmalı
    };
    
    await telegramService.sendDailyReport(stats);
    
    logger.info('📊 Günlük rapor gönderildi', stats);
  }
  
  /**
   * Cache temizleme - Her saatte
   */
  scheduleCacheClear() {
    const job = cron.schedule('0 * * * *', async () => {
      try {
        technicalAnalysis.clearCache();
        logger.info('🧹 Technical analysis cache temizlendi');
      } catch (error) {
        logger.error('Cache temizleme hatası:', error);
      }
    });
    
    this.jobs.set('cache_clear', job);
    logger.info('🧹 Cache temizleme job başlatıldı (her saat)');
  }
  
  /**
   * Order timeout kontrolü - Her dakika
   */
  scheduleOrderTimeoutCheck() {
    const job = cron.schedule('* * * * *', async () => {
      try {
        await this.checkOrderTimeouts();
      } catch (error) {
        logger.error('Order timeout kontrolü hatası:', error);
      }
    });
    
    this.jobs.set('order_timeout', job);
    logger.info('⏰ Order timeout kontrolü başlatıldı (her dakika)');
  }
  
  async checkOrderTimeouts() {
    const configService = require('../services/configService');
    const timeoutMinutes = configService.get('ORDER_TIMEOUT_MINUTES');
    const now = Date.now();
    
    const activeOrders = exchangeService.getActiveOrders();
    
    for (const orderInfo of activeOrders) {
      const orderAge = (now - orderInfo.createdAt.getTime()) / (1000 * 60); // dakika
      
      if (orderAge > timeoutMinutes) {
        try {
          await exchangeService.cancelOrder(orderInfo.id);
          
          logger.info(`⏰ Order timeout iptal: ${orderInfo.id} (${orderAge.toFixed(1)} dk)`);
          
          await telegramService.sendMessage(`
⏰ <b>ORDER TIMEOUT</b>

📊 <b>Coin:</b> ${orderInfo.symbol}
🆔 <b>Order ID:</b> ${orderInfo.id}
⏱ <b>Süre:</b> ${orderAge.toFixed(1)} dakika

Belirlenen süre aşıldığı için order iptal edildi.
          `.trim());
          
        } catch (error) {
          logger.error(`Order timeout iptal hatası ${orderInfo.id}:`, error);
        }
      }
    }
  }
  
  /**
   * Belirli bir job'ı durdur
   */
  stopJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      this.jobs.delete(jobName);
      logger.info(`🛑 ${jobName} job durduruldu`);
    }
  }
  
  /**
   * Tüm job'ları durdur
   */
  stopAll() {
    for (const [name, job] of this.jobs) {
      job.stop();
      logger.info(`🛑 ${name} job durduruldu`);
    }
    this.jobs.clear();
    logger.info('🛑 Tüm cron job\'ları durduruldu');
  }
  
  /**
   * Job durumları
   */
  getStatus() {
    const status = {};
    for (const [name, job] of this.jobs) {
      status[name] = {
        running: job.running || false,
        scheduled: job.scheduled || false
      };
    }
    return status;
  }
}

module.exports = new CronJobs();
