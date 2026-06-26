# Sanayi Veri Analizi ve DesignBuilder Destekli Muhendislik Yardimci Programi

## 1. Kapak
- Proje adi: Sanayi Veri Analizi ve DesignBuilder Destekli Muhendislik Yardimci Programi
- Amac: CSV ve DesignBuilder ciktilarini analiz ederek enerji, verimlilik, konfor ve karar destek raporlari uretmek.
- Kapsam: Mevcut sistem analizi, DesignBuilder raporlama, karsilastirma, gecmis kayitlari, maliyet optimizasyonu.

## 2. Problem ve Ihtiyac
- Sanayi ve bina performansi verileri genellikle ham CSV dosyalari halinde gelir.
- Ham verinin yorumlanmasi zaman alir, hata riski tasir ve muhendislik bakisi gerektirir.
- Farkli senaryolari elle karsilastirmak hem maliyetli hem de tekrar edilebilirlik acisindan zordur.
- Bu proje, veriyi muhendislik kararina donusturen yardimci bir arayuz olarak tasarlandi.

## 3. Genel Sistem Mimarisi
- Next.js tabanli web arayuzu.
- Supabase veritabani ve kayit altyapisi.
- Gemini Flash tabanli dusuk maliyetli AI analiz katmani.
- CSV isleme, sayisal ozetleme, rapor uretme ve gecmis kayitlarini gosterme modulleri.

## 4. Mevcut Sistem: CSV Analiz Akisi
- Kullanici CSV dosyasini yukler.
- Dosya dogrudan analiz endpoint'ine gonderilir; gereksiz depolama-indirme adimi kaldirildi.
- Sistem sutunlari, sayisal alanlari, tuketim ve performans metriklerini tespit eder.
- Enerji tasarrufu, eski/yeni tuketim, OEE ve anomali bilgileri uretilir.

## 5. CSV Dosyalarina Bakis Acisi
- Veri tipi ve sutun adlari incelenir.
- Sayisal kolonlar ayrilir ve enerji/tuketim/performans baglami aranir.
- Ilk satirlar onizleme icin kullanilir, tum satirlar hesaplamaya dahil edilir.
- Anomali tespiti icin aykiri degerler ve z-score yaklasimi kullanilir.
- Sonuc yalnizca metin degil; grafik, tablo ve muhendislik raporu olarak sunulur.

## 6. DesignBuilder Sistemi
- DesignBuilder export CSV dosyalari proje ve senaryo mantigiyla yuklenir.
- Her senaryo icin isitma yuku, sogutma yuku, sicaklik, nem ve zon bazli veriler analiz edilir.
- Sistem her dosyadan bolumlu teknik rapor uretir.
- Birden fazla senaryo varsa karsilastirma raporu ile en uygun alternatif secilir.

## 7. DesignBuilder Dosyalarina Bakis Acisi
- Zaman serisi davranisi: yuklerin zamana gore degisimi.
- Zon analizi: en yuksek isitma/sogutma yukune sahip bolgeler.
- Pik yuk analizi: sistem boyutlandirma riski.
- Termal konfor: sicaklik ve nem degerlerinin kullanici konforuna etkisi.
- Veri kalitesi: negatif yukler, eksik kolonlar, supheli maksimum/minimum degerler.
- Maliyet ve karbon: enerji tuketiminin isletme maliyeti ve emisyon etkisi.

## 8. Muhendislik Yardimci Programi Olarak Rol
- Program nihai karar verici degil, muhendise hizli analiz ve rapor destegi sunan yardimci arac olarak konumlanir.
- Tekrar eden hesaplari otomatiklestirir.
- Muhendisin bakmasi gereken kritik noktalarin listesini cikarir.
- Hatalari saklamak yerine veri kalitesi ve dogrulama notlariyla gorunur hale getirir.

## 9. Dogruluk ve Guvenilirlik Yaklasimi
- Hesaplamalar ham veriden deterministik olarak uretilir.
- AI metin uretimi, sayisal ozet ve hesaplanan metrikler uzerinden yapilir.
- Raporlarda veri eksigi varsa bu durum not edilir; kesin olmayan bilgi kesinmis gibi sunulmaz.
- Gecmis raporlar ve duzenlemeler kayit altina alinarak izlenebilirlik saglanir.

## 10. Gecmis ve Kayit Sistemi
- Mevcut sistem analizleri artik son 5 ile sinirli degil; tum analizler listelenir.
- Yeni gecmis sayfasinda mevcut sistem, DesignBuilder raporlari ve karsilastirma sonuclari birlikte goruntulenir.
- Supabase uzerinde analiz sonuclari, rapor bolumleri ve DesignBuilder karsilastirmalari saklanir.

## 11. Maliyet ve Performans Optimizasyonu
- DesignBuilder kismi Gemini Flash/Flash-Lite modellerine sabitlendi.
- Pro modeller filtrelenerek yuksek maliyet riski azaltildi.
- Rapor bolumu token limiti ve baglam miktari dusuruldu.
- Sonuc: daha hizli rapor uretimi, daha dusuk API maliyeti ve daha kontrollu cikti.

## 12. Sonuc
- Proje, ham CSV ve DesignBuilder verilerini okunabilir muhendislik kararlarina donusturur.
- Hem sanayi verimlilik analizi hem de bina enerji performansi icin ortak bir karar destek altyapisi sunar.
- Grafikler, tablolar, teknik raporlar ve gecmis kayitlariyla muhendisin is akisini hizlandirir.
