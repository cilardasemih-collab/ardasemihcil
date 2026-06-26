import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public", "sunum");
const outputPath = path.join(outputDir, "ardasemihcil-proje-sunumu.pdf");

const slides = [
  {
    kicker: "Bitirme Projesi Sunumu",
    title: "Sanayi Veri Analizi ve DesignBuilder Destekli Muhendislik Yardimci Programi",
    subtitle:
      "CSV ve DesignBuilder ciktilarini analiz ederek enerji, verimlilik, konfor ve karar destek raporlari ureten web tabanli sistem.",
    points: ["Mevcut sistem analizi", "DesignBuilder senaryo raporlama", "Gecmis kayitlari ve karsilastirma", "Gemini Flash ile dusuk maliyetli analiz"],
  },
  {
    kicker: "Problem",
    title: "Ham veri muhendislik kararina dogrudan donusmez",
    subtitle: "Sanayi ve bina performansi verileri genellikle uzun, karmasik ve hata riski tasiyan CSV dosyalari halinde gelir.",
    points: [
      "Elle inceleme zaman alir ve tekrarlanabilirligi dusuktur.",
      "Enerji, konfor, maliyet ve veri kalitesi ayni anda degerlendirilmelidir.",
      "Farkli senaryolari karsilastirmak icin standart bir karar destegi gerekir.",
      "Bu proje, veriyi yorumlanabilir muhendislik raporuna donusturen yardimci programdir.",
    ],
  },
  {
    kicker: "Mimari",
    title: "Next.js + Supabase + Gemini Flash tabanli moduler yapi",
    subtitle: "Sistem arayuz, analiz API'leri, veritabani kaydi ve AI destekli raporlama katmanlarindan olusur.",
    points: [
      "Next.js arayuz: dosya yukleme, grafikler, rapor ekranlari ve gecmis sayfasi.",
      "Supabase: analiz sonuclari, DesignBuilder senaryolari ve rapor bolumleri icin kayit altyapisi.",
      "Gemini Flash/Flash-Lite: hizli ve dusuk maliyetli teknik metin uretimi.",
      "Deterministik hesaplama: enerji toplamlarinin, OEE metriklerinin ve anomalilerin kod tarafinda hesaplanmasi.",
    ],
  },
  {
    kicker: "Mevcut Sistem",
    title: "Sanayi CSV analiz akisi",
    subtitle: "Kullanici CSV dosyasini yukler; sistem dosyayi dogrudan analiz endpoint'ine gonderir ve raporlar.",
    points: [
      "Gereksiz Supabase Storage yukle-indir adimi kaldirildi; zaman asimi riski azaltildi.",
      "Sayisal sutunlar, enerji/tuketim/performance baglami ve hedef kolonlar belirlenir.",
      "Eski tuketim, yeni tuketim, tasarruf miktari ve OEE ozeti hesaplanir.",
      "Grafik, tablo, anomali listesi, uzman raporu ve aksiyon onerileri uretilir.",
    ],
  },
  {
    kicker: "Veriye Bakis",
    title: "CSV dosyalari hangi acilardan inceleniyor?",
    subtitle: "Sistem ham veriyi sadece metin olarak okumaz; sayisal davranis ve muhendislik baglami arar.",
    points: [
      "Sutun adlari ve veri tipleri analiz edilir.",
      "Sayisal kolonlar ayrilir; enerji, guc, tuketim, performans ve kalite iliskileri aranir.",
      "Ilk satirlar onizleme icin kullanilir, hesaplamalar tum satirlara uygulanir.",
      "Aykiri degerler ve supheli noktalar anomali listesinde gorunur hale getirilir.",
    ],
  },
  {
    kicker: "DesignBuilder",
    title: "Bina enerji performansi ve senaryo raporlama",
    subtitle: "DesignBuilder export CSV dosyalari proje/senaryo mantigiyla islenir ve bolumlu teknik rapora donusur.",
    points: [
      "Her senaryo icin isitma yuku, sogutma yuku, sicaklik, nem ve zon verileri okunur.",
      "Zaman serisi davranisi, pik yukler ve zon bazli kritik alanlar belirlenir.",
      "Her dosya icin 10 bolumlu teknik rapor akisi calisir.",
      "Birden fazla senaryo varsa karsilastirma raporu ile en dengeli alternatif secilir.",
    ],
  },
  {
    kicker: "Muhendislik Perspektifleri",
    title: "DesignBuilder dosyalarina teknik bakis acilari",
    subtitle: "Analiz sadece toplam enerjiye bakmaz; tasarim kararini etkileyen coklu kriterleri birlikte yorumlar.",
    points: [
      "Enerji profili: isitma/sogutma yuklerinin dengesi ve zaman icindeki degisimi.",
      "Pik yuk: ekipman boyutlandirma ve sistem kapasitesi acisindan riskler.",
      "Termal konfor: sicaklik, nem ve kullanim profili eksiklerinin etkisi.",
      "Veri kalitesi: negatif yukler, eksik kolonlar, supheli minimum/maksimum degerler.",
      "Karbon ve maliyet: tuketimin isletme maliyeti ve emisyon tarafindaki sonucu.",
    ],
  },
  {
    kicker: "Dogruluk",
    title: "AI metni sayisal hesaplamalarin ustune kurulur",
    subtitle: "Sistem, verileri dogru analiz etmek icin hesaplama ve metin uretimini birbirinden ayirir.",
    points: [
      "Enerji toplamlarinin ve ana metriklerin hesabi deterministik kod tarafinda yapilir.",
      "AI raporlama, hesaplanmis ozet ve metrikleri yorumlar; ham tahmin uretmez.",
      "Veri eksigi varsa raporda dogrulama ihtiyaci olarak belirtilir.",
      "Anomali ve veri kalitesi notlari, muhendisin kontrol edecegi noktalar olarak sunulur.",
    ],
  },
  {
    kicker: "Kayit ve Gecmis",
    title: "Eski ve yeni sonuclar izlenebilir hale getirildi",
    subtitle: "Yeni gecmis sayfasi analizleri tek merkezden goruntulemeyi saglar.",
    points: [
      "Mevcut sistem analizleri artik son 5 kayitla sinirli degil; tum analizler listelenir.",
      "DesignBuilder senaryo raporlari ve karsilastirma sonuclari gecmis ekraninda acilabilir.",
      "Supabase uzerinde analiz sonuclari, rapor bolumleri ve karsilastirma kayitlari saklanir.",
      "Kayit merkezi, proje surecinde geri donus ve denetim izlenebilirligi saglar.",
    ],
  },
  {
    kicker: "Maliyet Optimizasyonu",
    title: "DesignBuilder icin Gemini Flash/Flash-Lite kullanildi",
    subtitle: "Rapor kalitesini korurken API maliyeti ve bekleme suresi azaltildi.",
    points: [
      "Gemini Pro modelleri filtrelendi; sistem yalnizca Flash ailesini kullanacak sekilde ayarlandi.",
      "Varsayilan model sirasi: Flash-Lite, Flash ve eski Flash adaylari.",
      "Rapor bolumu token limiti 3800'den 1400'e indirildi.",
      "Baglam arama limiti 5'ten 3'e dusuruldu; daha hizli ve kontrollu cikti saglandi.",
    ],
  },
  {
    kicker: "Ciktilar",
    title: "Muhendisin kullanabilecegi rapor ve karar destek urunleri",
    subtitle: "Sistem yalnizca ekranda sonuc gostermekle kalmaz; karar surecinde kullanilacak materyal uretir.",
    points: [
      "CSV onizleme, enerji grafigi, OEE grafigi ve katkı/ anomali tablolari.",
      "Mevcut sistem icin muhendislik raporu, uygulama onerileri ve ornek sorular.",
      "DesignBuilder icin bolumlu teknik rapor ve muhendis denetimi ekranlari.",
      "Senaryo karsilastirma sonucu, kazanan senaryo ve bolum bazli gerekceler.",
    ],
  },
  {
    kicker: "Sonuc",
    title: "Proje bir muhendislik yardimci programi olarak konumlanir",
    subtitle: "Ham veriyi dogrudan karar destegine donusturen, izlenebilir ve dusuk maliyetli bir analiz platformu olusturuldu.",
    points: [
      "Sanayi CSV verileri ve bina performans ciktilari ortak bir arayuzde analiz edilir.",
      "Hesaplama, raporlama, karsilastirma ve gecmis kaydi tek is akisi altinda toplandi.",
      "Sistem muhendisin yerine karar vermez; muhendisin kararini hizlandiran teknik destek uretir.",
      "Gelistirilebilir yapi sayesinde yeni metrikler, yeni rapor bolumleri ve ek dogrulama kurallari eklenebilir.",
    ],
  },
];

const mm = {
  width: 297,
  height: 167,
  margin: 16,
};

const colors = {
  ink: [15, 23, 42],
  muted: [71, 85, 105],
  teal: [13, 148, 136],
  cyan: [8, 145, 178],
  green: [22, 163, 74],
  amber: [217, 119, 6],
  pale: [240, 253, 250],
  line: [203, 213, 225],
};

const fontPathCandidates = [
  "C:/Windows/Fonts/arial.ttf",
  "C:/Windows/Fonts/calibri.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
];

function registerFont(pdf) {
  const fontPath = fontPathCandidates.find((candidate) => fs.existsSync(candidate));
  if (!fontPath) return "helvetica";

  const fontData = fs.readFileSync(fontPath).toString("base64");
  pdf.addFileToVFS("PresentationFont.ttf", fontData);
  pdf.addFont("PresentationFont.ttf", "PresentationFont", "normal");
  return "PresentationFont";
}

function setFill(pdf, color) {
  pdf.setFillColor(color[0], color[1], color[2]);
}

function setDraw(pdf, color) {
  pdf.setDrawColor(color[0], color[1], color[2]);
}

function setText(pdf, color) {
  pdf.setTextColor(color[0], color[1], color[2]);
}

function wrapped(pdf, text, x, y, maxWidth, lineHeight, options = {}) {
  const lines = pdf.splitTextToSize(text, maxWidth);
  pdf.text(lines, x, y, options);
  return y + lines.length * lineHeight;
}

function drawHeader(pdf, slide, index, fontName) {
  setFill(pdf, colors.pale);
  pdf.rect(0, 0, mm.width, mm.height, "F");

  setFill(pdf, colors.teal);
  pdf.rect(0, 0, 9, mm.height, "F");

  setDraw(pdf, colors.line);
  pdf.setLineWidth(0.35);
  pdf.line(mm.margin, 132, mm.width - mm.margin, 132);

  pdf.setFont(fontName, "normal");
  pdf.setFontSize(10);
  setText(pdf, colors.teal);
  pdf.text(slide.kicker.toUpperCase(), mm.margin, 18);

  pdf.setFontSize(9);
  setText(pdf, colors.muted);
  pdf.text(`${String(index + 1).padStart(2, "0")} / ${slides.length}`, mm.width - mm.margin, 18, { align: "right" });
}

function drawTitleSlide(pdf, slide, fontName) {
  pdf.setFont(fontName, "normal");
  setText(pdf, colors.ink);
  pdf.setFontSize(28);
  wrapped(pdf, slide.title, mm.margin, 48, 190, 11);

  pdf.setFontSize(13);
  setText(pdf, colors.muted);
  wrapped(pdf, slide.subtitle, mm.margin, 88, 170, 6.2);

  setFill(pdf, colors.ink);
  pdf.roundedRect(mm.margin, 119, 86, 18, 3, 3, "F");
  pdf.setFontSize(11);
  setText(pdf, [255, 255, 255]);
  pdf.text("Muhendislik Karar Destegi", mm.margin + 8, 131);

  const startX = 198;
  const startY = 47;
  slide.points.forEach((point, itemIndex) => {
    const y = startY + itemIndex * 23;
    setFill(pdf, itemIndex % 2 === 0 ? colors.cyan : colors.green);
    pdf.roundedRect(startX, y, 66, 14, 2.5, 2.5, "F");
    pdf.setFontSize(9.5);
    setText(pdf, [255, 255, 255]);
    wrapped(pdf, point, startX + 5, y + 5.7, 56, 4.2);
  });
}

function drawContentSlide(pdf, slide, index, fontName) {
  drawHeader(pdf, slide, index, fontName);

  pdf.setFont(fontName, "normal");
  pdf.setFontSize(23);
  setText(pdf, colors.ink);
  const afterTitleY = wrapped(pdf, slide.title, mm.margin, 38, 178, 9.2);

  pdf.setFontSize(10.8);
  setText(pdf, colors.muted);
  wrapped(pdf, slide.subtitle, mm.margin, afterTitleY + 4, 185, 5.5);

  const boxX = 205;
  const boxY = 38;
  setFill(pdf, [255, 255, 255]);
  setDraw(pdf, colors.line);
  pdf.roundedRect(boxX, boxY, 66, 75, 4, 4, "FD");
  pdf.setFontSize(11);
  setText(pdf, colors.teal);
  pdf.text("Teknik odak", boxX + 8, boxY + 13);
  setText(pdf, colors.ink);
  pdf.setFontSize(23);
  pdf.text(String(index).padStart(2, "0"), boxX + 8, boxY + 33);
  pdf.setFontSize(9);
  setText(pdf, colors.muted);
  wrapped(pdf, "Veriden rapora, rapordan muhendislik kararina izlenebilir akis.", boxX + 8, boxY + 47, 49, 4.5);

  let y = 86;
  slide.points.forEach((point, itemIndex) => {
    const markerColor = [colors.teal, colors.cyan, colors.green, colors.amber][itemIndex % 4];
    setFill(pdf, markerColor);
    pdf.circle(mm.margin + 2.5, y - 1.5, 2, "F");
    pdf.setFontSize(11.2);
    setText(pdf, colors.ink);
    y = wrapped(pdf, point, mm.margin + 9, y, 176, 5.7);
    y += 4.5;
  });

  pdf.setFontSize(8.5);
  setText(pdf, colors.muted);
  pdf.text("ardasemihcil projesi - mevcut sistem ve DesignBuilder muhendislik yardimci programi", mm.margin, 150);
}

fs.mkdirSync(outputDir, { recursive: true });

const pdf = new jsPDF({
  orientation: "landscape",
  unit: "mm",
  format: [mm.width, mm.height],
  compress: true,
});
const fontName = registerFont(pdf);

slides.forEach((slide, index) => {
  if (index > 0) pdf.addPage([mm.width, mm.height], "landscape");
  drawHeader(pdf, slide, index, fontName);
  if (index === 0) {
    drawTitleSlide(pdf, slide, fontName);
  } else {
    drawContentSlide(pdf, slide, index, fontName);
  }
});

pdf.save(outputPath);
console.log(`Presentation written to ${outputPath}`);
