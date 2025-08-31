# Bot Kuralları (Cursor için)

Bu dosya, Cursor tarafından kullanılacak **kuralları** tanımlar. Amaç: **Node.js tabanlı bir bot** geliştirmektir. Bot, TradingView webhook üzerinden sinyal alır, filtrelerden ve opsiyonel AI katmanından geçirir ve sonucu Telegram’a bildirim olarak gönderir.

## Kurallar

---

## 1️⃣ Sinyal Akışı

1. **TradingView sinyali gelir**  
   - AlphaTrendStrategy (BUY / SELL, 15m/30m, bar kapanışı).

2. **Global market filtresi (BTC/ETH – 4h)**  
   - EMA200 üstünde → long serbest, short reddet.  
   - EMA200 altında → short serbest, long reddet.  

3. **Local coin filtreleri (15m/30m)**  
   - EMA200 trend yönü (sinyal yönü ile uyumlu olmalı).  
   - ADX14 > 20 (trend gücü).  
   - rVOL > 1.2 (hacim teyidi).  
   - BB width > 0.01 (flat değil).  
   - Herhangi biri fail → **Sinyal Reddedilir**.  

4. **AI Katmanı (opsiyonel)**  
   - Girdi: sinyal bilgisi + teknik özet + haber/sentiment.  
   - Çıkış: **BUY / SELL / IGNORE**.  
   - IGNORE → işlem atlanır.  

5. **Final Karar**  
   - Global filtre ✅ + Local filtreler ✅ + AI onayı ✅ → **Sinyal Onaylı**.  
   - Herhangi biri fail → **Sinyal Reddedilir**.  

---

## 2️⃣ Bot Ayarları Akışı

```

1. **İşlem Başına USDT Miktarı**  
   - Her işlemde kullanılacak **sabit USDT** tutarı. (Örn. 10 USDT)
   - Borsa minimumları ve adım kısıtları (lot/price step) otomatik yuvarlanır.

2. **Maksimum İşlem Sayıları**  
   - **Global Maks. Aktif İşlem:** Aynı anda toplam en fazla kaç işlem açık olabilir.  
   - **Parite Başına Maks.:** Tek bir coinde aynı anda en fazla kaç işlem açılabilir.  
   - Limit doluysa, onaylı sinyal **atlanır** (log: `limit_reached`).

3. **İlk Emir Mesafesi**  
   - **Anında Giriş (>= 0%)**: Sinyal fiyatından **hemen** market/limit giriş.  
   - **Negatif %**: Sinyal fiyatının **altına** limit emir koy.  
     - Örnek: Sinyal = **1000 USDT**, ayar = **-1%** ⇒ limit **990 USDT**.
   - **Emir İptal Süresi**: Belirlenen dakika/saat içinde dolmazsa **iptal edilir** (log: `expired`).

4. **Tekrar Alım (DCA) Ayarları**  
   - **Tekrar Alım Sayısı:** Kaç defa ek alım yapılacağı (0 = kapalı).  
   - **Tekrar Alım Mesafesi (%):** Her ek alım için gerekli düşüş yüzdesi.  
     - Örnek: Mesafe **3%**, giriş **100$** ⇒ 1. DCA **97$**, 2. DCA **94.09$**, 3. DCA **91.27$**.  
   - Not: DCA, ortalama maliyeti düşürür **ama riski artırır** — dikkatli seçin.

5. **TP / SL Ayarları**  
   - **Kâr Al (TP %):** Kullanıcı belirler (ör. %0.5–%3).  
   - **Zararı Durdur (SL %):** Kullanıcı belirler (ör. %1–%5).  
   - (İsteğe bağlı) SL’yi **DCA tamamlandıktan sonra** devreye al.

6. **Otomatik Pozisyon Kapatma** *(Opsiyonel)*  
   - Belirlenen süre dolunca **pozisyonu kapat**.  
   - **"Hiçbiri"** seçilirse, pozisyon manuel/SL ile kapanana kadar açık kalır.

7. **Partial TP / Trailing** *(Opsiyonel)*  
   - **Partial TP:** Küçük kârda %X’ini kapat.  
   - **Trailing Stop:** Fiyat ilerledikçe stop’u takip ettir.

8. **Daily Loss Cap** *(Opsiyonel)*  
   - Günlük toplam zarar **%X**’e ulaşırsa **bot durur** (trade açmaz).

9. **Log / UI**  
   - Her işlemde: giriş/çıkış fiyatı, PnL, neden etiketleri (onay/red), DCA adımları, iptal/expire olayları.  
   - Panelde: Açık/kapalı işlemler, günlük/haftalık özet.
```