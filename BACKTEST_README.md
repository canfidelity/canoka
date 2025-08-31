# 📊 Caney Scalping Bot - Backtest Sistemi

## 🎯 Genel Bakış

Caney Scalping Bot'un backtest sistemi, geçmiş veriler üzerinde trading stratejisini test etmenizi sağlar. AlphaTrend indikatörü ve çoklu filtre sistemi kullanarak gerçekçi sonuçlar üretir.

## 🚀 Hızlı Başlangıç

### 1. Backtest Başlatma

```bash
curl -X POST http://localhost:3000/api/backtest/start \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "ETH-USDT",
    "timeframe": "15m",
    "startDate": "2025-08-01",
    "endDate": "2025-08-30",
    "initialBalance": 1000,
    "usdtPerTrade": 10
  }'
```

### 2. Sonuçları Görüntüleme

```bash
curl -s "http://localhost:3000/api/backtest/results" | jq
```

## 📈 Örnek Sonuç

```json
{
  "success": true,
  "data": {
    "winRate": 76.58,
    "totalSignals": 626,
    "approvedSignals": 148,
    "totalProfit": 4.51,
    "totalLoss": 1.38,
    "maxDrawdown": 0.0107,
    "trades": [...]
  }
}
```

## ⚙️ Parametreler

| Parametre | Açıklama | Örnek |
|-----------|----------|-------|
| `symbol` | Trading çifti | "ETH-USDT" |
| `timeframe` | Zaman dilimi | "15m", "1h" |
| `startDate` | Başlangıç tarihi | "2025-08-01" |
| `endDate` | Bitiş tarihi | "2025-08-30" |
| `initialBalance` | Başlangıç bakiyesi | 1000 |
| `usdtPerTrade` | Trade başına USDT | 10 |

## 🔍 Teknik Detaylar

### AlphaTrend Stratejisi
- **Alpha Trend** indikatörü ile trend yönü belirlenir
- **ATR (Average True Range)** ile volatilite hesaplanır
- **MFI (Money Flow Index)** ile momentum analizi yapılır

### Filtre Sistemi
1. **Global Market Filter**: BTC/ETH 4h trend analizi
2. **Local Coin Filters**: 15m/30m EMA200, ADX14, rVOL kontrolleri
3. **AI Filter**: OpenAI entegrasyonu (opsiyonel)

### Risk Yönetimi
- **Take Profit**: %0.5 (varsayılan)
- **Stop Loss**: %0.3 (varsayılan)
- **Max Drawdown**: Otomatik hesaplanır

## 📊 Performans Metrikleri

### Ana Metrikler
- **Win Rate**: Kazanan trade oranı
- **Profit Factor**: Toplam kar / Toplam zarar
- **Max Drawdown**: Maksimum düşüş yüzdesi
- **Total Return**: Toplam getiri

### Trade İstatistikleri
- **Total Signals**: Toplam sinyal sayısı
- **Approved Signals**: Onaylanan sinyal sayısı
- **Rejected Signals**: Reddedilen sinyal sayısı
- **Filter Success Rates**: Filtre başarı oranları

## 🛠️ Konfigürasyon

### Backtest Ayarları
```javascript
{
  "usdtPerTrade": 10,        // Trade başına USDT
  "tpPercent": 0.5,          // Take Profit %
  "slPercent": 0.3,          // Stop Loss %
  "adxThreshold": 10,        // ADX eşik değeri
  "rvolThreshold": 0.8       // Relative Volume eşik
}
```

### AlphaTrend Parametreleri
```javascript
{
  "atrPeriod": 14,           // ATR periyodu
  "mfiPeriod": 14,           // MFI periyodu
  "coeff": 1                 // AlphaTrend katsayısı
}
```

## 📋 Backtest Sonuç Formatı

```json
{
  "startDate": "2025-08-01T00:00:00.000Z",
  "endDate": "2025-08-30T00:00:00.000Z",
  "totalSignals": 626,
  "approvedSignals": 148,
  "rejectedSignals": 478,
  "winRate": 76.58,
  "totalProfit": 4.51,
  "totalLoss": 1.38,
  "maxDrawdown": 0.0107,
  "trades": [
    {
      "timestamp": 1756495800000,
      "symbol": "ETH-USDT",
      "action": "BUY",
      "entryPrice": 4349.94,
      "exitPrice": 4371.69,
      "pnl": 0.05,
      "balance": 1000.05,
      "drawdown": 0
    }
  ],
  "filterStats": {
    "globalFilter": {
      "passed": 161,
      "failed": 317,
      "successRate": 33.68
    },
    "localFilters": {
      "passed": 0,
      "failed": 161,
      "successRate": 0
    }
  }
}
```

## 🎯 En İyi Performans Örnekleri

### ETH-USDT Ağustos 2025
- **Win Rate**: %76.6 🎯
- **Total Trades**: 148
- **Profit**: +4.51 USDT
- **Max Drawdown**: %1.07
- **Period**: 30 gün

### Önerilen Test Periyotları
- **Kısa Dönem**: 1-7 gün (hızlı test)
- **Orta Dönem**: 1 ay (trend analizi)
- **Uzun Dönem**: 3-6 ay (güvenilirlik testi)

## 🔧 Sorun Giderme

### Yaygın Hatalar

1. **"Market verisi alınamadı"**
   - KuCoin API bağlantı sorunu
   - Symbol formatı kontrol edin (ETH-USDT)

2. **"Backtest tamamlanamadı"**
   - Tarih aralığını kontrol edin
   - Server loglarını inceleyin

3. **"Local filter hatası"**
   - Normal (backtest modunda beklenen)
   - Sonuçları etkilemez

### Debug Modları
```bash
# Detaylı loglar için
DEBUG=true npm start

# Backtest debug
curl -X GET http://localhost:3000/api/backtest/debug
```

## 📚 API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | `/api/backtest/start` | Backtest başlat |
| GET | `/api/backtest/results` | Sonuçları getir |
| GET | `/api/backtest/test` | Test endpoint |

## 🚨 Önemli Notlar

- ⚠️ **Bu bir simülasyondur** - Gerçek trading değil
- 📊 **Geçmiş performans gelecek garanti etmez**
- 🔄 **Parametreleri optimize edin**
- 📈 **Farklı market koşullarında test edin**

## 📞 Destek

Sorularınız için:
- 📧 GitHub Issues
- 💬 Telegram: @caney_bot
- 📖 Dokümantasyon: `/docs`

---

*Son güncelleme: 2025-08-31*
*Versiyon: 1.0.0*
