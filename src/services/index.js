const logger = require('../utils/logger');
const telegramService = require('./telegramService');
const exchangeService = require('./exchangeService');
const configService = require('./configService');
const cronJobs = require('../utils/cronJobs');

async function initializeServices() {
  try {
    logger.info('📋 Servisler başlatılıyor...');
    
    // Config service başlat
    await configService.initialize();
    logger.info('✅ Config servisi hazır');
    
    // Telegram bot başlat
    if (process.env.TELEGRAM_BOT_TOKEN) {
      await telegramService.initialize();
      logger.info('✅ Telegram servisi hazır');
    } else {
      logger.warn('⚠️ Telegram bot token bulunamadı');
    }
    
    // Exchange bağlantısını test et
    if (process.env.BINANCE_API_KEY) {
      await exchangeService.initialize();
      logger.info('✅ Exchange servisi hazır');
    } else {
      logger.warn('⚠️ Exchange API keys bulunamadı');
    }
    
    // Cron job'ları başlat
    cronJobs.initializeAll();
    logger.info('✅ Cron job'ları başlatıldı');
    
    logger.info('🎯 Tüm servisler aktif');
    
  } catch (error) {
    logger.error('Servis başlatma hatası:', error);
    throw error;
  }
}

module.exports = {
  initializeServices
};
