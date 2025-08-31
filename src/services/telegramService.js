const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');

class TelegramService {
  constructor() {
    this.bot = null;
    this.chatId = null;
    this.initialized = false;
  }
  
  async initialize() {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      this.chatId = process.env.TELEGRAM_CHAT_ID;
      
      if (!token || !this.chatId) {
        throw new Error('Telegram bot token veya chat ID eksik');
      }
      
      this.bot = new TelegramBot(token, { polling: false });
      
      // Test mesajı
      await this.sendMessage('🤖 Caney Scalping Bot aktif!');
      
      this.initialized = true;
      logger.info('Telegram servisi başlatıldı');
      
    } catch (error) {
      logger.error('Telegram başlatma hatası:', error);
      throw error;
    }
  }
  
  async sendMessage(text, options = {}) {
    if (!this.initialized) {
      logger.warn('Telegram servisi aktif değil, mesaj gönderilemiyor');
      return;
    }
    
    try {
      await this.bot.sendMessage(this.chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...options
      });
    } catch (error) {
      logger.error('Telegram mesaj gönderme hatası:', error);
    }
  }
  
  async sendTradeNotification(data) {
    const { type, signal, processResult, tradeResult } = data;
    
    if (type === 'SIGNAL_APPROVED') {
      const message = this.formatApprovedSignal(signal, processResult, tradeResult);
      await this.sendMessage(message);
      
    } else if (type === 'SIGNAL_REJECTED') {
      const message = this.formatRejectedSignal(signal, processResult);
      await this.sendMessage(message);
    }
  }
  
  formatApprovedSignal(signal, processResult, tradeResult) {
    const emoji = signal.action === 'BUY' ? '🟢' : '🔴';
    
    return `
${emoji} <b>SINYAL ONAYLANDI</b>

📊 <b>Coin:</b> ${signal.symbol}
🎯 <b>Aksiyon:</b> ${signal.action}
💰 <b>Fiyat:</b> $${signal.price}
⏰ <b>Timeframe:</b> ${signal.timeframe}

✅ <b>Filtre Sonuçları:</b>
${this.formatFilterResults(processResult.filterResults)}

📈 <b>Trade Detayları:</b>
🆔 Order ID: ${tradeResult?.orderId || 'N/A'}
💵 Miktar: ${processResult.tradeParams?.quantity || 'N/A'}
🎯 TP: ${processResult.tradeParams?.takeProfitPrice || 'N/A'}
🛑 SL: ${processResult.tradeParams?.stopPrice || 'N/A'}

⏱ <b>İşlem Zamanı:</b> ${new Date().toLocaleString('tr-TR')}
    `.trim();
  }
  
  formatRejectedSignal(signal, processResult) {
    return `
❌ <b>SINYAL REDDEDİLDİ</b>

📊 <b>Coin:</b> ${signal.symbol}
🎯 <b>Aksiyon:</b> ${signal.action}
💰 <b>Fiyat:</b> $${signal.price}

❌ <b>Red Sebebi:</b> ${processResult.reason}

📊 <b>Filtre Sonuçları:</b>
${this.formatFilterResults(processResult.filterResults)}

⏱ <b>Zaman:</b> ${new Date().toLocaleString('tr-TR')}
    `.trim();
  }
  
  formatFilterResults(filterResults) {
    if (!filterResults) return 'Bilgi yok';
    
    let result = '';
    
    if (filterResults.globalFilter) {
      result += `🌍 Global: ${filterResults.globalFilter.passed ? '✅' : '❌'} ${filterResults.globalFilter.reason}\n`;
    }
    
    if (filterResults.localFilters) {
      result += `🎯 Local: ${filterResults.localFilters.passed ? '✅' : '❌'}\n`;
      if (filterResults.localFilters.details) {
        Object.entries(filterResults.localFilters.details).forEach(([key, value]) => {
          result += `  - ${key}: ${value.passed ? '✅' : '❌'}\n`;
        });
      }
    }
    
    if (filterResults.aiFilter) {
      result += `🤖 AI: ${filterResults.aiFilter.passed ? '✅' : '❌'} ${filterResults.aiFilter.decision}`;
    }
    
    return result;
  }
  
  async sendErrorNotification(data) {
    const message = `
🚨 <b>BOT HATASI</b>

❌ <b>Hata:</b> ${data.error}
📊 <b>Sinyal:</b> ${data.signal?.symbol || 'Bilinmiyor'} - ${data.signal?.action || 'N/A'}
⏱ <b>Zaman:</b> ${new Date().toLocaleString('tr-TR')}
    `.trim();
    
    await this.sendMessage(message);
  }
  
  async sendDailyReport(stats) {
    const message = `
📊 <b>GÜNLÜK ÖZET</b>

📈 <b>İşlemler:</b>
• Toplam Sinyal: ${stats.totalSignals}
• Onaylanan: ${stats.approvedSignals}
• Reddedilen: ${stats.rejectedSignals}
• Win Rate: ${stats.winRate}%

💰 <b>P&L:</b>
• Toplam: $${stats.totalPnl}
• Kazanan: ${stats.winningTrades}
• Kaybeden: ${stats.losingTrades}

⏱ <b>Tarih:</b> ${new Date().toLocaleDateString('tr-TR')}
    `.trim();
    
    await this.sendMessage(message);
  }
}

module.exports = new TelegramService();
