# Endustriyel Enerji Verimliligi ve OEE Analiz Platformu

## Proje Hakkinda
Bu proje, sanayi tipi CSV veri setlerini alip yapay zeka destekli bir "Agentic Workflow" akisi ile analiz eden ve enerji verimliligi odakli karar destegi ureten bir Next.js platformudur.

Sistem su zinciri takip eder:
1. Kullanici CSV dosyasini yukler.
2. AI ilk ornek veriye bakarak optimizasyon yaklasimini belirler.
3. Backend tum satirlara matematiksel optimizasyon uygular.
4. Tasarruf metrikleri hesaplanir ve profesyonel muhendislik raporu uretilir.
5. OEE (Kullanilabilirlik, Performans, Kalite) odakli ek aksiyon plani sunulur.
6. Sonuclar Supabase veritabanina kaydedilir ve dashboard uzerinden izlenir.

Bu mimari, veri isleme + AI muhendislik yorumlama + karar aksiyonu + kalici kayit adimlarini tek bir operasyon panelinde birlestirir.

## Teknoloji Yigini
- Framework: Next.js (App Router)
- Dil: TypeScript
- UI: Tailwind CSS, Recharts, React Markdown
- Backend/Storage/DB: Supabase (PostgreSQL + Storage)
- AI: Google Gemini API

## Agentic Workflow Ozeti
- Adim 1: CSV upload
- Adim 2: Ilk 5 satir + basliklar ile AI teshisi
- Adim 3: Tum veri uzerinde dinamik optimizasyon simulesi
- Adim 4: Nihai markdown muhendislik raporu
- Adim 5: Sonuclarin Supabase'e kaydi + gecmis listeleme
- Adim 6: Enerji karsilastirma grafigi + OEE aksiyon plani

## Kurulum
### 1. Repoyu kur
```bash
npm install
```

### 2. Ortam degiskenlerini tanimla
Kok dizinde `.env.local` olustur:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
GOOGLE_AI_API_KEY=YOUR_GOOGLE_AI_KEY
GOOGLE_AI_MODEL=gemini-1.5-flash
```

### 3. Supabase migrationlarini uygula
```bash
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
npx supabase db push
```

### 4. Uygulamayi calistir
```bash
npm run dev
```

## Ozellikler
- Otomatik Formul Tespiti (AI tabanli)
- Tum veri uzerinde dinamik matematiksel optimizasyon
- Anlik Tasarruf Hesabi (eski/yeni tuketim ve tasarruf)
- AI Destekli Muhendislik Raporlama (Markdown)
- OEE Aksiyon Plani Uretimi (3 maddelik pratik tavsiye)
- Supabase uzerinde kalici analiz kaydi
- Son 5 analiz gecmisi ve enerji karsilastirma grafigi

## Build ve Lint Kontrolu
Canliya cikmadan once terminalde:

```bash
npm run build
npm run lint
```

Notlar:
- Build sirasinda TypeScript hatalari gorursen once tip uyumsuzluklarini duzelt.
- Sik karsilasilan sorunlar:
	- Gereksiz `any` kullanimi
	- API response tiplerinin eksik tanimlanmasi
	- Null/undefined kontrolu olmadan erisim
	- Interface/type ile gercek veri sekli arasinda uyumsuzluk
- Cozum yaklasimi:
	- Her API payload icin acik type tanimla
	- `unknown` gelen datayi parse edip dogrula
	- `strict` modda nullable alanlari kosullu kontrol et

## Vercel Deployment Rehberi
1. Kodu GitHub reposuna pushla.
2. Vercel panelinde `Add New Project` ile ilgili repoyu sec.
3. Framework otomatik Next.js olarak algilanir.
4. `Environment Variables` alanina su degerleri ekle:
	 - `NEXT_PUBLIC_SUPABASE_URL`
	 - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
	 - `SUPABASE_SERVICE_ROLE_KEY`
	 - `GOOGLE_AI_API_KEY`
	 - `GOOGLE_AI_MODEL`
5. Deploy tusuna bas.

Kritik not: Supabase URL ve key degerleri Vercel'de `Environment Variables` kisminda tanimli olmadan API rotalari dogru calismaz.

## Guvenlik ve Ayrisiklik Notu
Bu proje `wamtes` kod tabanindan ayridir. Ayrica Supabase ve Vercel hesap/proje baglantilari izole olmalidir.

