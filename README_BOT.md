# 🤖 Caney Scalping Bot

15 dakikalık timeframe'de altcoin scalping için geliştirilmiş Node.js tabanlı trading botu.

## 🚀 Özellikler

### ⚡ Core Sistem
- **TradingView Webhook** desteği (AlphaTrendStrategy)
- **Multi-layer filtre sistemi** (Global + Local + AI)
- **Risk management** ve position sizing
- **Real-time Telegram** bildirimleri
- **Binance** entegrasyonu (spot trading)

### 📊 Filtre Sistemi
1. **Global Market Filter** (BTC/ETH 4h EMA200)
2. **Local Coin Filters** (EMA200, ADX14, rVOL, BB Width)
3. **AI Layer** (OpenAI GPT-4o-mini ile sentiment analizi)

### 🛡️ Risk Management
- Maksimum aktif işlem sayısı
- Coin başına işlem limiti  
- Günlük zarar cap'i
- Otomatik SL/TP
- DCA (Dollar Cost Averaging) desteği

## 📁 Proje Yapısı

```
caney/
├── src/
│   ├── controllers/          # Route handlers
│   ├── services/            # Business logic
│   │   ├── filters/         # Filtre modülleri
│   │   ├── signalProcessor.js
│   │   ├── exchangeService.js
│   │   ├── riskManager.js
│   │   └── technicalAnalysis.js
│   ├── routes/              # Express routes
│   ├── middlewares/         # Validation, auth
│   ├── models/              # Data models
│   ├── utils/               # Helper functions
│   └── index.js             # Ana server
├── logs/                    # Log dosyaları
├── package.json
├── env.example              # Environment template
└── readme.md               # Bot kuralları
```

## 🔧 Kurulum

### 1. Dependencies Yükle
```bash
npm install
```

### 2. Environment Ayarları
```bash
cp env.example .env
# .env dosyasını düzenle
```

### 3. Gerekli API Keys
- **Binance API** (trading için)
- **Telegram Bot Token** (bildirimler için)
- **OpenAI API Key** (AI filtre için - opsiyonel)
- **TradingView Webhook Secret** (güvenlik için)

### 4. Bot'u Başlat
```bash
# Development
npm run dev

# Production
npm start
```

## ⚙️ Konfigürasyon

### Trading Ayarları
```env
DEFAULT_USDT_AMOUNT=10          # İşlem başına USDT
MAX_ACTIVE_TRADES=5             # Maksimum aktif işlem
MAX_TRADES_PER_COIN=2           # Coin başına limit
DEFAULT_TP_PERCENT=0.5          # Take Profit %
DEFAULT_SL_PERCENT=0.3          # Stop Loss %
```

### Risk Management
```env
DAILY_LOSS_CAP_PERCENT=5        # Günlük zarar limiti %
DCA_ENABLED=true                # DCA açık/kapalı
DCA_MAX_STEPS=2                 # Maksimum DCA adımı
DCA_DISTANCE_PERCENT=3          # DCA mesafesi %
```

### AI & Filters
```env
AI_ENABLED=true                 # AI filtre açık/kapalı
ADX_THRESHOLD=20                # ADX minimum değeri
RVOL_THRESHOLD=1.2              # Relative volume minimum
BB_WIDTH_THRESHOLD=0.01         # Bollinger bands width minimum
```

## 📡 TradingView Webhook

### Webhook URL
```
POST https://yourserver.com/webhook/tradingview
```

### JSON Format
```json
{
  "strategy": "AlphaTrendStrategy",
  "action": "BUY",
  "symbol": "ADAUSDT",
  "timeframe": "15m",
  "price": 0.5234,
  "timestamp": 1703123456789,
  "secret": "your_webhook_secret"
}
```

## 🤖 AI Entegrasyonu

Bot, isteğe bağlı olarak OpenAI GPT-4o-mini kullanarak sinyalleri analiz eder:

### Input
- Sinyal bilgisi (coin, aksiyon, fiyat)
- Teknik analiz verileri (EMA, ADX, rVOL, BB)
- Global market durumu (BTC/ETH trend)

### Output
- **BUY**: Sinyali onayla
- **SELL**: Sinyali onayla  
- **IGNORE**: Sinyali reddet

## 📊 Monitoring & Logs

### Telegram Bildirimleri
- ✅ Onaylanan sinyaller
- ❌ Reddedilen sinyaller
- 💰 Trade sonuçları
- 📊 Günlük özet raporları
- 🚨 Hata bildirimleri

### Log Dosyaları
- `logs/combined.log` - Tüm loglar
- `logs/error.log` - Sadece hatalar
- `logs/trades.log` - Trade geçmişi

### Cron Jobs
- **Order Monitoring** (5 dakikada bir)
- **Daily Report** (23:59'da)
- **Cache Clear** (saatte bir)
- **Order Timeout** (dakikada bir)

## 🔒 Güvenlik

- Webhook secret doğrulaması
- Input validation (Joi schema)
- Rate limiting
- API key encryption
- Error handling & logging

## 📈 Performance

### Hedef Metrikler
- **Win Rate**: %85+
- **Daily Signals**: 30-40 adet
- **Max Drawdown**: %5
- **Response Time**: <500ms

### Optimizasyonlar
- Technical analysis cache (1 dakika)
- Parallel filter execution
- Async/await pattern
- Memory-efficient data structures

## 🛠️ API Endpoints

```
GET  /health                    # Health check
POST /webhook/tradingview       # TradingView signals
POST /webhook/test              # Test endpoint
```

## 🐛 Troubleshooting

### Yaygın Hatalar
1. **Binance API Error**: API keys ve permissions kontrol et
2. **Telegram Bot Error**: Bot token ve chat ID kontrol et
3. **Webhook Rejected**: Secret key doğruluğunu kontrol et
4. **Insufficient Balance**: USDT bakiyesi yetersiz

### Log Kontrolü
```bash
tail -f logs/combined.log       # Genel loglar
tail -f logs/error.log          # Sadece hatalar
tail -f logs/trades.log         # Trade logları
```

## 📝 Lisans

MIT License

## 🤝 Katkıda Bulunma

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Create pull request

---

**⚠️ Risk Uyarısı**: Kripto trading risklidir. Bot kullanımından doğacak kayıplardan sorumluluk kabul edilmez. Test ortamında deneyip, küçük miktarlarla başlayın.
