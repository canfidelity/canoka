const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const logger = require('./utils/logger');
const webhookRoutes = require('./routes/webhook');
const { initializeServices } = require('./services');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/webhook', webhookRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Caney Scalping Bot'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize services and start server
async function startBot() {
  try {
    logger.info('🚀 Caney Scalping Bot başlatılıyor...');
    
    // Initialize all services
    await initializeServices();
    
    app.listen(PORT, () => {
      logger.info(`🎯 Bot ${PORT} portunda çalışıyor`);
      logger.info('📊 15m Scalping sistemi aktif');
    });
    
  } catch (error) {
    logger.error('Bot başlatma hatası:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Bot kapatılıyor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Bot kapatılıyor...');
  process.exit(0);
});

startBot();
