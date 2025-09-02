# 🚨 Production Sunucu Sorunları ve Çözümleri

## Tespit Edilen Sorunlar

### 1. Port Çakışması (EADDRINUSE: address already in use 0.0.0.0:80)
- **Sorun**: Bot port 80'i kullanmaya çalışıyor ama port zaten kullanımda
- **Nedeni**: Sunucuda nginx/apache gibi web server port 80'de çalışıyor

### 2. Webhook Validation Hataları
- **Sorun**: "Geçersiz webhook data" hatası sürekli tekrarlanıyor
- **Nedeni**: TradingView'dan gelen veri formatı beklenen schema ile uymuyor

---

## Hızlı Çözümler

### Adım 1: Port Problemini Çöz
```bash
# Sunucuda hangi port'ların kullanıldığını kontrol et
sudo netstat -tulpn | grep :80
sudo lsof -i :80

# Bot'u farklı port'ta çalıştır
export PORT=3000
pm2 restart canoka-bot

# Veya .env dosyasını düzenle
echo "PORT=3000" >> /root/.env
```

### Adım 2: Nginx Reverse Proxy Kurulumu (Opsiyonel)
```bash
# Nginx config oluştur
sudo nano /etc/nginx/sites-available/canoka-bot

# Config içeriği:
server {
    listen 80;
    server_name your_domain_or_ip;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Activate config
sudo ln -s /etc/nginx/sites-available/canoka-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Adım 3: Webhook Debug için Log İyileştirmesi
- Validation.js dosyasında daha detaylı logging eklendi
- Gelen webhook verilerinin tam formatı loglanacak
- Hangi field'ların eksik/yanlış olduğu görülecek

### Adım 4: PM2 ile Yeniden Başlatma
```bash
# Mevcut logs'u temizle
pm2 flush

# Bot'u yeniden başlat
pm2 restart canoka-bot

# Real-time log izle
pm2 logs canoka-bot --lines 100
```

---

## Webhook Debug Rehberi

### TradingView Sinyal Formatını Kontrol Et
Bot şu formatı bekliyor:
```json
{
  "strategy": "AlphaTrend Strategy",
  "action": "BUY",
  "symbol": "BTCUSDT", 
  "timeframe": "15m",
  "price": 43250.50,
  "timestamp": 1693500000,
  "secret": "your_webhook_secret"
}
```

### Common TradingView Webhook Hatları:
1. **Secret eksik/yanlış**: TradingView alert message'ında `"secret": "your_secret"` eklemeyi unutma
2. **Number format**: `price` ve `timestamp` number olmalı, string değil
3. **Action values**: Sadece "BUY" veya "SELL" kabul ediliyor (büyük harf)
4. **Required fields**: Tüm field'lar zorunlu

---

## Monitoring

### PM2 Status Check
```bash
# Bot durumunu kontrol et
pm2 status

# Memory/CPU kullanımını gör
pm2 monit

# Restart count kontrol et (çok fazlaysa problem var)
pm2 info canoka-bot
```

### Log Analizi
```bash
# Error log'ları kontrol et
tail -f /root/.pm2/logs/canoka-bot-error.log

# Success log'ları kontrol et  
tail -f /root/.pm2/logs/canoka-bot-out.log

# Webhook validation sonuçlarını filtrele
pm2 logs canoka-bot | grep "webhook"
```

---

## Test Etme

### Webhook Test
```bash
# Bot test endpoint'i dene
curl -X POST http://localhost:3000/webhook/test

# TradingView webhook'u manuel test et
curl -X POST http://localhost:3000/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "Test Strategy",
    "action": "BUY", 
    "symbol": "BTCUSDT",
    "timeframe": "15m",
    "price": 43000,
    "timestamp": 1693500000,
    "secret": "YOUR_WEBHOOK_SECRET"
  }'
```

### Health Check
```bash
curl http://localhost:3000/health
```

---

## Güvenlik Önerileri

1. **Webhook Secret**: Güçlü, unique bir secret kullan
2. **IP Whitelist**: Sadece TradingView IP'lerinden webhook kabul et
3. **Rate Limiting**: Çok fazla request'i engellemek için
4. **HTTPS**: Production'da SSL kullan

---

## Önemli Notlar

- ✅ Validation logging iyileştirildi
- ✅ Error handling detaylandırıldı  
- ⚠️ Port config düzeltilmeli
- ⚠️ Webhook secret kontrolü yapılmalı
- ⚠️ TradingView alert message formatı kontrol edilmeli
