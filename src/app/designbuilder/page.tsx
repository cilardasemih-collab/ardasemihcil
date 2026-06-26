import Link from "next/link";

import DesignBuilderStudio from "@/components/DesignBuilderStudio";

export const metadata = {
  title: "DesignBuilder Dijital Mühendislik Ofisi",
  description: "DesignBuilder CSV raporlama, denetim ve optimizasyon sistemi",
};

export default function DesignBuilderPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,#d1fae5_0,#f8fafc_35%,#e0f2fe_100%)] px-6 py-12">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white/70 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-800">
              DesignBuilder Studio
            </p>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
              <Link href="/" className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600">
                Mevcut Sistem
              </Link>
              <span className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                DesignBuilder
              </span>
              <Link href="/gecmis" className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600">
                Geçmiş
              </Link>
              <Link href="/qr-olusturucu" className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600">
                QR Oluşturucu
              </Link>
            </div>
          </div>
          <h1 className="text-4xl font-black leading-tight text-slate-900 md:text-5xl">
            DesignBuilder Dijital Mühendislik Ofisi
          </h1>
          <p className="max-w-3xl text-base text-slate-700">
            DesignBuilder CSV çıktılarını ayrı bir iş akışıyla yükle, senaryo raporlarını bölüm bölüm üret,
            mühendis denetiminden geçir ve optimizasyonu yalnızca tamamlanmış raporlar üzerinden çalıştır.
          </p>
        </section>

        <DesignBuilderStudio />
      </div>
    </main>
  );
}
