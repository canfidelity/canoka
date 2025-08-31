const logger = require('../utils/logger');

class ConfigService {
  constructor() {
    this.config = new Map();
    this.initialized = false;
  }
  
  async initialize() {
    try {
      // Default konfigürasyonlar
      this.config.set('DEFAULT_USDT_AMOUNT', parseFloat(process.env.DEFAULT_USDT_AMOUNT) || 10);
      this.config.set('MAX_ACTIVE_TRADES', parseInt(process.env.MAX_ACTIVE_TRADES) || 5);
      this.config.set('MAX_TRADES_PER_COIN', parseInt(process.env.MAX_TRADES_PER_COIN) || 2);
      
      // Risk management
      this.config.set('DEFAULT_TP_PERCENT', parseFloat(process.env.DEFAULT_TP_PERCENT) || 0.5);
      this.config.set('DEFAULT_SL_PERCENT', parseFloat(process.env.DEFAULT_SL_PERCENT) || 0.3);
      this.config.set('DAILY_LOSS_CAP_PERCENT', parseFloat(process.env.DAILY_LOSS_CAP_PERCENT) || 5);
      
      // Trading ayarları
      this.config.set('ENTRY_DISTANCE_PERCENT', parseFloat(process.env.ENTRY_DISTANCE_PERCENT) || 0);
      this.config.set('ORDER_TIMEOUT_MINUTES', parseInt(process.env.ORDER_TIMEOUT_MINUTES) || 5);
      
      // DCA ayarları
      this.config.set('DCA_ENABLED', process.env.DCA_ENABLED === 'true');
      this.config.set('DCA_MAX_STEPS', parseInt(process.env.DCA_MAX_STEPS) || 2);
      this.config.set('DCA_DISTANCE_PERCENT', parseFloat(process.env.DCA_DISTANCE_PERCENT) || 3);
      
      // Filter ayarları
      this.config.set('ADX_THRESHOLD', parseFloat(process.env.ADX_THRESHOLD) || 20);
      this.config.set('RVOL_THRESHOLD', parseFloat(process.env.RVOL_THRESHOLD) || 1.2);
      this.config.set('BB_WIDTH_THRESHOLD', parseFloat(process.env.BB_WIDTH_THRESHOLD) || 0.01);
      
      // AI ayarları
      this.config.set('AI_ENABLED', process.env.AI_ENABLED === 'true');
      
      // Advanced trading ayarları
      this.config.set('AUTO_CLOSE_TIMEOUT_HOURS', parseInt(process.env.AUTO_CLOSE_TIMEOUT_HOURS) || 0);
      this.config.set('PARTIAL_TP_ENABLED', process.env.PARTIAL_TP_ENABLED === 'true');
      this.config.set('PARTIAL_TP_PERCENT', parseFloat(process.env.PARTIAL_TP_PERCENT) || 50);
      this.config.set('TRAILING_STOP_ENABLED', process.env.TRAILING_STOP_ENABLED === 'true');
      this.config.set('TRAILING_STOP_DISTANCE', parseFloat(process.env.TRAILING_STOP_DISTANCE) || 0.2);
      
      this.initialized = true;
      logger.info('Config servisi başlatıldı', {
        usdtAmount: this.get('DEFAULT_USDT_AMOUNT'),
        maxTrades: this.get('MAX_ACTIVE_TRADES'),
        tpPercent: this.get('DEFAULT_TP_PERCENT'),
        slPercent: this.get('DEFAULT_SL_PERCENT')
      });
      
    } catch (error) {
      logger.error('Config başlatma hatası:', error);
      throw error;
    }
  }
  
  get(key) {
    if (!this.initialized) {
      throw new Error('Config servisi henüz başlatılmadı');
    }
    return this.config.get(key);
  }
  
  set(key, value) {
    this.config.set(key, value);
    logger.info(`Config güncellendi: ${key} = ${value}`);
  }
  
  getAll() {
    if (!this.initialized) {
      throw new Error('Config servisi henüz başlatılmadı');
    }
    return Object.fromEntries(this.config);
  }
  
  // Runtime'da config güncelleme
  updateTradingConfig(updates) {
    const allowedKeys = [
      'DEFAULT_USDT_AMOUNT',
      'DEFAULT_TP_PERCENT', 
      'DEFAULT_SL_PERCENT',
      'MAX_ACTIVE_TRADES',
      'MAX_TRADES_PER_COIN',
      'ENTRY_DISTANCE_PERCENT'
    ];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key)) {
        this.set(key, value);
      } else {
        logger.warn(`Geçersiz config key: ${key}`);
      }
    }
  }
}

module.exports = new ConfigService();
