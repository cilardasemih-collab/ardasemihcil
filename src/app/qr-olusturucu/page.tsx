import Link from "next/link";
import QrGenerator from "@/components/QrGenerator";

export const metadata = {
  title: "QR Kodu Oluştur",
  description: "DesignBuilder QR kodu oluşturma aracı",
};

export default function QrOlusturucuPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,#d1fae5_0,#f8fafc_35%,#e0f2fe_100%)] px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="space-y-4 rounded-3xl border border-cyan-100 bg-white/70 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex rounded-full border border-cyan-300 bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-800">
              Utility
            </p>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
              <Link href="/" className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600">
                Ana Sayfa
              </Link>
              <span className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white">
                QR Olusturucu
              </span>
            </div>
          </div>
          <h1 className="text-4xl font-black leading-tight text-slate-900 md:text-5xl">
            QR Kodlarini Uret, <br /> Kaydet ve Dagit
          </h1>
          <p className="max-w-2xl text-base text-slate-700">
            Bu sayfa yalnizca QR uretiyor. DesignBuilder ve analiz akisindan bagimsiz olarak kullanabilirsin.
          </p>
        </section>

        <QrGenerator />
      </div>
    </main>
  );
}
