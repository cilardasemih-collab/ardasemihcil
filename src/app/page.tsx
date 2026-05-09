import Link from "next/link";

import AnalysisHistory from "@/components/AnalysisHistory";
import FileUpload from "@/components/FileUpload";

export default function Page() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,#d1fae5_0,#f8fafc_35%,#e0f2fe_100%)] px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="space-y-4 rounded-3xl border border-cyan-100 bg-white/70 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex rounded-full border border-cyan-300 bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-800">
              Agentic Workflow
            </p>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
              <span className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white">
                Mevcut Sistem
              </span>
              <Link href="/designbuilder" className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600">
                DesignBuilder
              </Link>
              <Link href="/qr-olusturucu" className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600">
                QR Olusturucu
              </Link>
            </div>
          </div>
          <h1 className="text-4xl font-black leading-tight text-slate-900 md:text-5xl">
            Sanayi Verini Yukle, <br /> Analizi Baslat
          </h1>
          <p className="max-w-xl text-base text-slate-700">
            Bu sayfa yalnizca mevcut sanayi CSV analiz sistemini calistirir. DesignBuilder ekosistemi ayri bir
            sayfada, kendi raporlama ve optimizasyon akisiyle calisir.
          </p>
        </section>

        <FileUpload />
      </div>

      <div className="mx-auto mt-8 max-w-6xl">
        <AnalysisHistory />
      </div>
    </main>
  );
}
