# ardasemihcil

Bu proje **wamtes'ten tamamen bağımsızdır**. Ayrı Supabase projesi + ayrı Vercel projesi ile çalışır.

## 1) Ayrı Supabase projesi oluştur
- Supabase'de yeni proje aç: `ardasemihcil`
- Kesinlikle `wamtes` URL/KEY kullanma.

## 2) Ortam değişkenleri
`.env.local` oluştur:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... # opsiyonel
OPENAI_API_KEY=...            # opsiyonel
```

## 3) Migration çalıştır
Proje klasöründe:

```bash
npm install
npx supabase login
npx supabase link --project-ref <ARDASEMIHCIL_PROJECT_REF>
npx supabase db push
```

Bu migration şunları kurar:
- `analysis_jobs`
- `processed_data`
- `uploaded-excels` storage bucket
- gerekli RLS policy'leri

## 4) Local çalıştır
```bash
npm run dev
```

## 5) Ayrı Vercel projesine deploy et
- Vercel'de **yeni** project oluştur (`ardasemihcil`)
- Root directory: `d:/ardasemihcil`
- Environment Variables'a bu projenin **kendi** Supabase değerlerini gir

## Karışmayı önleme kontrol listesi
- `NEXT_PUBLIC_SUPABASE_URL` içinde `wamtes` projesi geçmemeli.
- Vercel Project Name ayrı olmalı.
- Supabase Project Ref ayrı olmalı.
- Bu klasör dışında (`d:/wamtes`) hiçbir dosya deploy edilmemeli.
