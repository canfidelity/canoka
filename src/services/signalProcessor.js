const logger = require('../utils/logger');
const globalFilter = require('./filters/globalFilter');
const localFilters = require('./filters/localFilters');
const aiFilter = require('./filters/aiFilter');
const configService = require('./configService');

class SignalProcessor {
  async processSignal(signalData) {
    const startTime = Date.now();
    const results = {
      signal: signalData,
      approved: false,
      reason: '',
      filterResults: {},
      processingTime: 0
    };
    
    try {
      logger.info(`🔍 Sinyal işleniyor: ${signalData.symbol} ${signalData.action}`);
      
      // 1. Global Market Filtresi (BTC/ETH – 4h)
      logger.info('📊 Global market filtresi kontrol ediliyor...');
      const globalResult = await globalFilter.check(signalData);
      results.filterResults.globalFilter = globalResult;
      
      if (!globalResult.passed) {
        results.reason = `Global filtre: ${globalResult.reason}`;
        results.processingTime = Date.now() - startTime;
        return results;
      }
      
      // 2. Local Coin Filtreleri - KALDIRILDI (ESKİ HAL)
      const localResult = { passed: true, reason: 'Local filtreler kaldırıldı - gereksiz' };
      results.filterResults.localFilters = localResult;
      logger.info('✅ Local filtreler kaldırıldı - sadece Global filter + AlphaTrend kullanılıyor');
      
      // 3. AI Katmanı (opsiyonel)
      if (configService.get('AI_ENABLED')) {
        logger.info('🤖 AI katmanı kontrol ediliyor...');
        const aiResult = await aiFilter.check(signalData, {
          globalFilter: globalResult,
          localFilters: localResult
        });
        results.filterResults.aiFilter = aiResult;
        
        if (!aiResult.passed) {
          results.reason = `AI filtre: ${aiResult.reason}`;
          results.processingTime = Date.now() - startTime;
          return results;
        }
      } else {
        logger.info('🤖 AI katmanı devre dışı');
        results.filterResults.aiFilter = { passed: true, reason: 'AI disabled' };
      }
      
      // 4. Final Onay
      results.approved = true;
      results.reason = 'Tüm filtreler başarılı';
      results.processingTime = Date.now() - startTime;
      
      logger.info(`✅ Sinyal onaylandı: ${signalData.symbol} ${signalData.action} (${results.processingTime}ms)`);
      
      return results;
      
    } catch (error) {
      logger.error('Signal processing error:', error);
      results.reason = `İşleme hatası: ${error.message}`;
      results.processingTime = Date.now() - startTime;
      return results;
    }
  }
  
  // Signal istatistikleri için
  getFilterStats() {
    return {
      globalFilter: globalFilter.getStats(),
      localFilters: localFilters.getStats(),
      aiFilter: aiFilter.getStats()
    };
  }
}

module.exports = new SignalProcessor();
