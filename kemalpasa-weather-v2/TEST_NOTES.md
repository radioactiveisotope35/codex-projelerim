# Test Notları

## A1: Yavaş ağ ve ICON zaman aşımı
1. Tarayıcı geliştirici araçlarıyla ağ hızını sınırlayın ve ICON isteğini geciktirin.
2. Yenileme sonrası ECMWF verisi gelirken ICON 8 sn sonunda TIMEOUT olarak görünmeli, grafikler yine dolu olmalı.

## A2: MET Norway 403 yanıtı
1. met.no isteğine müdahale ederek 403 döndürün.
2. MET Norway rozeti "PASİF" olur, diğer sağlayıcılardan gelen verilerle grafikler ve tablolar devam eder.

## A3: Hızlı koordinat değişimleri
1. Enlem/boylam girdilerini hızlıca değiştirin veya farklı noktalara tıklayın.
2. Debounce 500 ms sonra yeni veri yükler; grafikler her seferinde temizlenip yeniden oluşturulur, kayda değer FPS düşüşü görülmez.

## A4: Radar oynatma
1. Oynat düğmesine basarak 2× hız seçin.
2. Kareler akıcı ilerler; geri/ileri düğmeleri tek kare adım atar, opaklık kaydırıcısı harita üzerindeki yoğunluğu anında değiştirir.

## A5: Open-Meteo önbelleği
1. Bir konum için verileri yükledikten sonra sayfayı 45 dakika içinde yenileyin.
2. Ağ talepleri önbellekten gelir (latency 0 ms görünür), süre dolunca yeniden istek yapılır.

## A6: Erişilebilirlik
1. Klavye ile sekme sırasını dolaşın; tüm kontroller sırasıyla odaklanabilir.
2. Rozetler durum değişimlerinde güncellenir, bildirim alanı aria-live sayesinde ekran okuyuculara aktarılır.
