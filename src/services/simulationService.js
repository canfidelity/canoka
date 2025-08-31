const logger = require('../utils/logger');
const configService = require('./configService');
const fs = require('fs').promises;
const path = require('path');

class SimulationService {
  constructor() {
    this.isSimulationMode = false;
    this.simulatedBalance = 1000; // $1000 starting balance
    this.activeTrades = new Map();
    this.tradeHistory = [];
    this.stats = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      winRate: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      highestBalance: 1000,
      startDate: new Date()
    };
  }
  
  async initialize() {
    this.isSimulationMode = process.env.SIMULATION_MODE === 'true';
    
    if (this.isSimulationMode) {
      logger.info('🎮 Simulation mode aktif');
      await this.loadHistoricalData();
    } else {
      logger.info('💰 Live trading mode aktif');
    }
  }
  
  /**
   * Trade simulation - gerçek exchange yerine
   */
  async simulateOrder(orderParams) {
    if (!this.isSimulationMode) {
      throw new Error('Simulation mode aktif değil');
    }
    
    const { symbol, side, quantity, price, stopPrice, takeProfitPrice } = orderParams;
    
    // Simulated order ID
    const orderId = `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Current market price simulation (gerçek API'den alınabilir)
    const currentPrice = await this.getCurrentPrice(symbol);
    const entryPrice = price || currentPrice;
    
    // Balance check
    const orderValue = quantity * entryPrice;
    if (orderValue > this.simulatedBalance) {
      throw new Error(`Yetersiz simulated balance: $${this.simulatedBalance.toFixed(2)}`);
    }
    
    // Create simulated trade
    const trade = {
      id: orderId,
      symbol,
      side,
      quantity,
      entryPrice,
      stopPrice,
      takeProfitPrice,
      orderValue,
      status: 'open',
      entryTime: new Date(),
      exitTime: null,
      exitPrice: null,
      pnl: 0,
      reason: null
    };
    
    this.activeTrades.set(orderId, trade);
    
    // Update balance
    this.simulatedBalance -= orderValue;
    
    logger.info(`🎮 Simulated order created: ${symbol} ${side} $${orderValue.toFixed(2)}`);
    
    // Start price monitoring for this trade
    this.monitorTrade(orderId);
    
    return {
      success: true,
      id: orderId,
      simulated: true,
      entryPrice,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Trade monitoring - TP/SL check
   */
  async monitorTrade(orderId) {
    const trade = this.activeTrades.get(orderId);
    if (!trade) return;
    
    // Price monitoring interval
    const checkInterval = setInterval(async () => {
      try {
        const currentPrice = await this.getCurrentPrice(trade.symbol);
        
        let shouldClose = false;
        let exitReason = null;
        
        // Check Stop Loss
        if (trade.stopPrice) {
          const slTriggered = (trade.side === 'buy' && currentPrice <= trade.stopPrice) ||
                             (trade.side === 'sell' && currentPrice >= trade.stopPrice);
          if (slTriggered) {
            shouldClose = true;
            exitReason = 'stop_loss';
          }
        }
        
        // Check Take Profit
        if (trade.takeProfitPrice && !shouldClose) {
          const tpTriggered = (trade.side === 'buy' && currentPrice >= trade.takeProfitPrice) ||
                             (trade.side === 'sell' && currentPrice <= trade.takeProfitPrice);
          if (tpTriggered) {
            shouldClose = true;
            exitReason = 'take_profit';
          }
        }
        
        if (shouldClose) {
          await this.closeTrade(orderId, currentPrice, exitReason);
          clearInterval(checkInterval);
        }
        
      } catch (error) {
        logger.error(`Trade monitoring error ${orderId}:`, error);
        clearInterval(checkInterval);
      }
    }, 5000); // Check every 5 seconds
    
    // Auto-close after 24 hours if still open
    setTimeout(() => {
      if (this.activeTrades.has(orderId)) {
        this.getCurrentPrice(trade.symbol).then(price => {
          this.closeTrade(orderId, price, 'timeout');
        });
        clearInterval(checkInterval);
      }
    }, 24 * 60 * 60 * 1000);
  }
  
  /**
   * Close simulated trade
   */
  async closeTrade(orderId, exitPrice, reason) {
    const trade = this.activeTrades.get(orderId);
    if (!trade) return;
    
    // Calculate P&L
    let pnl = 0;
    if (trade.side === 'buy') {
      pnl = (exitPrice - trade.entryPrice) * trade.quantity;
    } else {
      pnl = (trade.entryPrice - exitPrice) * trade.quantity;
    }
    
    // Update trade
    trade.exitPrice = exitPrice;
    trade.exitTime = new Date();
    trade.pnl = pnl;
    trade.reason = reason;
    trade.status = 'closed';
    
    // Update balance
    this.simulatedBalance += trade.orderValue + pnl;
    
    // Update statistics
    this.updateStats(trade);
    
    // Save to history
    this.tradeHistory.push({...trade});
    this.activeTrades.delete(orderId);
    
    // Save to file
    await this.saveTradeHistory();
    
    logger.trade('simulated_closed', {
      orderId,
      symbol: trade.symbol,
      side: trade.side,
      entryPrice: trade.entryPrice,
      exitPrice,
      pnl: pnl.toFixed(2),
      reason,
      balance: this.simulatedBalance.toFixed(2)
    });
    
    // Telegram notification
    await this.sendTradeNotification(trade);
  }
  
  /**
   * Update performance statistics
   */
  updateStats(trade) {
    this.stats.totalTrades++;
    
    if (trade.pnl > 0) {
      this.stats.winningTrades++;
      this.stats.totalProfit += trade.pnl;
    } else {
      this.stats.losingTrades++;
      this.stats.totalLoss += Math.abs(trade.pnl);
    }
    
    // Win rate
    this.stats.winRate = (this.stats.winningTrades / this.stats.totalTrades * 100);
    
    // Profit factor
    this.stats.profitFactor = this.stats.totalLoss > 0 ? 
      (this.stats.totalProfit / this.stats.totalLoss) : 
      (this.stats.totalProfit > 0 ? 999 : 0);
    
    // Drawdown calculation
    if (this.simulatedBalance > this.stats.highestBalance) {
      this.stats.highestBalance = this.simulatedBalance;
      this.stats.currentDrawdown = 0;
    } else {
      this.stats.currentDrawdown = ((this.stats.highestBalance - this.simulatedBalance) / this.stats.highestBalance * 100);
      if (this.stats.currentDrawdown > this.stats.maxDrawdown) {
        this.stats.maxDrawdown = this.stats.currentDrawdown;
      }
    }
  }
  
  /**
   * Get current price (simulation)
   */
  async getCurrentPrice(symbol) {
    try {
      // KuCoin ticker API
      const axios = require('axios');
      const response = await axios.get(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${symbol}`);
      return parseFloat(response.data.data.price);
    } catch (error) {
      // Fallback random price variation
      logger.warn(`Price API error for ${symbol}, using fallback`);
      return 1.0 + (Math.random() - 0.5) * 0.02; // ±1% variation
    }
  }
  
  /**
   * Save trade history to file
   */
  async saveTradeHistory() {
    try {
      const filePath = path.join(__dirname, '../../logs/simulation_history.json');
      const data = {
        stats: this.stats,
        balance: this.simulatedBalance,
        trades: this.tradeHistory,
        lastUpdate: new Date().toISOString()
      };
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Trade history save error:', error);
    }
  }
  
  /**
   * Load historical data
   */
  async loadHistoricalData() {
    try {
      const filePath = path.join(__dirname, '../../logs/simulation_history.json');
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);
      
      this.stats = parsed.stats || this.stats;
      this.simulatedBalance = parsed.balance || 1000;
      this.tradeHistory = parsed.trades || [];
      
      logger.info('📊 Historical simulation data loaded', {
        totalTrades: this.stats.totalTrades,
        winRate: this.stats.winRate.toFixed(2) + '%',
        balance: '$' + this.simulatedBalance.toFixed(2)
      });
      
    } catch (error) {
      logger.info('📊 Starting fresh simulation (no history found)');
    }
  }
  
  /**
   * Send trade notification
   */
  async sendTradeNotification(trade) {
    const telegramService = require('./telegramService');
    const emoji = trade.pnl > 0 ? '💰' : '📉';
    const profitColor = trade.pnl > 0 ? 'green' : 'red';
    
    const message = `
${emoji} <b>SIMULATED TRADE CLOSED</b>

📊 <b>Symbol:</b> ${trade.symbol}
${trade.side === 'buy' ? '🟢' : '🔴'} <b>Side:</b> ${trade.side.toUpperCase()}
💰 <b>Entry:</b> $${trade.entryPrice.toFixed(4)}
🎯 <b>Exit:</b> $${trade.exitPrice.toFixed(4)}
💵 <b>P&L:</b> $${trade.pnl.toFixed(2)}
📋 <b>Reason:</b> ${trade.reason}

📈 <b>Performance:</b>
💰 Balance: $${this.simulatedBalance.toFixed(2)}
🎯 Win Rate: ${this.stats.winRate.toFixed(1)}%
📊 Total Trades: ${this.stats.totalTrades}
    `.trim();
    
    await telegramService.sendMessage(message);
  }
  
  /**
   * Get performance stats
   */
  getPerformanceStats() {
    return {
      simulation: this.isSimulationMode,
      balance: this.simulatedBalance,
      activeTrades: this.activeTrades.size,
      stats: this.stats,
      recentTrades: this.tradeHistory.slice(-10) // Son 10 trade
    };
  }
  
  /**
   * Manual close trade (for testing)
   */
  async manualCloseTrade(orderId, reason = 'manual') {
    const trade = this.activeTrades.get(orderId);
    if (!trade) {
      throw new Error(`Trade bulunamadı: ${orderId}`);
    }
    
    const currentPrice = await this.getCurrentPrice(trade.symbol);
    await this.closeTrade(orderId, currentPrice, reason);
  }
  
  /**
   * Reset simulation
   */
  async resetSimulation() {
    this.simulatedBalance = 1000;
    this.activeTrades.clear();
    this.tradeHistory = [];
    this.stats = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      winRate: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      highestBalance: 1000,
      startDate: new Date()
    };
    
    await this.saveTradeHistory();
    logger.info('🔄 Simulation reset completed');
  }
}

module.exports = new SimulationService();
