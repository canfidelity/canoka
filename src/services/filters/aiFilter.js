const logger = require('../../utils/logger');
const axios = require('axios');

class AIFilter {
  constructor() {
    this.stats = {
      totalChecks: 0,
      passed: 0,
      failed: 0,
      ignored: 0,
      lastUpdate: null
    };
    this.apiKey = process.env.OPENAI_API_KEY;
  }
  
  /**
   * AI Katmanı (opsiyonel)
   * - Girdi: sinyal bilgisi + teknik özet + haber/sentiment
   * - Çıkış: BUY / SELL / IGNORE
   * - IGNORE → işlem atlanır
   */
  async check(signalData, filterContext) {
    this.stats.totalChecks++;
    this.stats.lastUpdate = new Date();
    
    try {
      if (!this.apiKey) {
        logger.warn('OpenAI API key bulunamadı, AI filtre atlanıyor');
        this.stats.passed++;
        return {
          passed: true,
          reason: 'AI devre dışı - API key yok',
          decision: 'BYPASS'
        };
      }
      
      logger.info(`🤖 AI analizi başlatılıyor: ${signalData.symbol} ${signalData.action}`);
      
      // AI için context hazırla
      const aiContext = this.prepareAIContext(signalData, filterContext);
      
      // OpenAI API çağrısı
      const aiDecision = await this.callOpenAI(aiContext);
      
      // Sonucu değerlendir
      const result = this.evaluateAIDecision(aiDecision, signalData);
      
      // İstatistikleri güncelle
      if (result.decision === 'IGNORE') {
        this.stats.ignored++;
      } else if (result.passed) {
        this.stats.passed++;
      } else {
        this.stats.failed++;
      }
      
      logger.info(`🤖 AI kararı: ${result.decision} - ${result.reason}`);
      
      return result;
      
    } catch (error) {
      this.stats.failed++;
      logger.error('AI filter error:', error);
      
      // AI hatası durumunda varsayılan olarak geçir (fail-safe)
      return {
        passed: true,
        reason: `AI hatası, varsayılan onay: ${error.message}`,
        decision: 'FALLBACK'
      };
    }
  }
  
  prepareAIContext(signalData, filterContext) {
    const context = {
      signal: {
        symbol: signalData.symbol,
        action: signalData.action,
        price: signalData.price,
        timeframe: signalData.timeframe,
        timestamp: new Date(signalData.timestamp).toISOString()
      },
      
      technicalAnalysis: {
        globalMarket: {
          btcTrend: filterContext.globalFilter?.details?.btcTrend,
          ethTrend: filterContext.globalFilter?.details?.ethTrend,
          marketTrend: filterContext.globalFilter?.details?.marketTrend
        },
        
        localFilters: {
          ema200: filterContext.localFilters?.details?.ema200,
          adx14: filterContext.localFilters?.details?.adx14,
          relativeVolume: filterContext.localFilters?.details?.relativeVolume,
          bollingerWidth: filterContext.localFilters?.details?.bollingerWidth
        }
      },
      
      marketConditions: {
        timestamp: new Date().toISOString(),
        timeframe: signalData.timeframe
      }
    };
    
    return context;
  }
  
  async callOpenAI(context) {
    const prompt = this.createAIPrompt(context);
    
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Sen bir kripto trading uzmanısın. Verilen teknik analiz verilerine göre trading sinyalini değerlendir ve BUY, SELL veya IGNORE kararı ver. Cevabın JSON formatında olmalı: {"decision": "BUY/SELL/IGNORE", "confidence": 0-100, "reasoning": "sebep"}'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 saniye timeout
      });
      
      const aiResponse = response.data.choices[0].message.content;
      
      try {
        return JSON.parse(aiResponse);
      } catch (parseError) {
        logger.warn('AI response JSON parse hatası, metin analizi yapılıyor');
        return this.parseTextResponse(aiResponse);
      }
      
    } catch (error) {
      logger.error('OpenAI API hatası:', error.message);
      throw new Error(`AI API çağrısı başarısız: ${error.message}`);
    }
  }
  
  createAIPrompt(context) {
    return `
Kripto Trading Sinyal Değerlendirmesi:

SINYAL BİLGİSİ:
- Coin: ${context.signal.symbol}
- Aksiyon: ${context.signal.action}
- Fiyat: $${context.signal.price}
- Timeframe: ${context.signal.timeframe}

TEKNİK ANALİZ:
Global Market:
- BTC Trend: ${context.technicalAnalysis.globalMarket.btcTrend}
- ETH Trend: ${context.technicalAnalysis.globalMarket.ethTrend}
- Market Trend: ${context.technicalAnalysis.globalMarket.marketTrend}

Local Analiz:
- EMA200: ${context.technicalAnalysis.localFilters.ema200?.trend} (${context.technicalAnalysis.localFilters.ema200?.passed ? 'Geçti' : 'Başarısız'})
- ADX14: ${context.technicalAnalysis.localFilters.adx14?.value} (${context.technicalAnalysis.localFilters.adx14?.passed ? 'Güçlü' : 'Zayıf'})
- rVOL: ${context.technicalAnalysis.localFilters.relativeVolume?.value} (${context.technicalAnalysis.localFilters.relativeVolume?.passed ? 'Yeterli' : 'Yetersiz'})
- BB Width: ${context.technicalAnalysis.localFilters.bollingerWidth?.value} (${context.technicalAnalysis.localFilters.bollingerWidth?.passed ? 'Volatil' : 'Flat'})

Bu verilere göre sinyali değerlendir ve kararını JSON formatında ver.
    `.trim();
  }
  
  parseTextResponse(text) {
    // AI response'u metin olarak parse etmeye çalış
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('buy') || lowerText.includes('al')) {
      return {
        decision: 'BUY',
        confidence: 70,
        reasoning: 'Metin analizinden BUY kararı çıkarıldı'
      };
    } else if (lowerText.includes('sell') || lowerText.includes('sat')) {
      return {
        decision: 'SELL',
        confidence: 70,
        reasoning: 'Metin analizinden SELL kararı çıkarıldı'
      };
    } else {
      return {
        decision: 'IGNORE',
        confidence: 50,
        reasoning: 'Belirsiz AI cevabı, IGNORE tercih edildi'
      };
    }
  }
  
  evaluateAIDecision(aiDecision, signalData) {
    const { decision, confidence, reasoning } = aiDecision;
    
    // readme.md'ye göre: BUY / SELL / IGNORE
    if (decision === 'IGNORE') {
      return {
        passed: false,
        reason: `AI IGNORE kararı: ${reasoning}`,
        decision: 'IGNORE',
        confidence
      };
    }
    
    // Signal ile AI kararı uyumlu mu?
    const signalCompatible = (signalData.action === 'BUY' && decision === 'BUY') ||
                            (signalData.action === 'SELL' && decision === 'SELL');
    
    if (signalCompatible) {
      return {
        passed: true,
        reason: `AI onayı: ${reasoning} (Güven: ${confidence}%)`,
        decision,
        confidence
      };
    } else {
      return {
        passed: false,
        reason: `AI farklı öneri: Signal ${signalData.action}, AI ${decision}`,
        decision,
        confidence
      };
    }
  }
  
  getStats() {
    return {
      ...this.stats,
      passRate: this.stats.totalChecks > 0 ? 
        (this.stats.passed / this.stats.totalChecks * 100).toFixed(2) + '%' : '0%',
      ignoreRate: this.stats.totalChecks > 0 ? 
        (this.stats.ignored / this.stats.totalChecks * 100).toFixed(2) + '%' : '0%'
    };
  }
}

module.exports = new AIFilter();
