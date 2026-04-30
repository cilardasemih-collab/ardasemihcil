"use client";

import { useState } from "react";
import AnalysisHistory from "@/components/AnalysisHistory";
import DesignBuilderOptimization from "@/components/DesignBuilderOptimization";
import FileUpload from "@/components/FileUpload";

type MainTab = "current" | "designbuilder";

export default function Page() {
  const [activeTab, setActiveTab] = useState<MainTab>("current");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,#d1fae5_0,#f8fafc_35%,#e0f2fe_100%)] px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="space-y-4 rounded-3xl border border-cyan-100 bg-white/70 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex rounded-full border border-cyan-300 bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-800">
              Agentic Workflow
            </p>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setActiveTab("current")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  activeTab === "current" ? "bg-cyan-600 text-white" : "text-slate-600"
                }`}
              >
                Mevcut Sistem
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("designbuilder")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  activeTab === "designbuilder" ? "bg-emerald-600 text-white" : "text-slate-600"
                }`}
              >
                DesignBuilder Optimizasyon
              </button>
            </div>
          </div>
          <h1 className="text-4xl font-black leading-tight text-slate-900 md:text-5xl">
            {activeTab === "current" ? (
              <>
                Sanayi Verini Yukle, <br /> Analizi Baslat
              </>
            ) : (
              <>
                DesignBuilder Dosyalarini Yukle, <br /> En Iyi U Degerini Sec
              </>
            )}
          </h1>
          <p className="max-w-xl text-base text-slate-700">
            {activeTab === "current"
              ? "Bu adimda sadece CSV dosyasini guvenli sekilde Supabase Storage'a aliyoruz. Sonraki adimlarda AI formulu cikaracak, optimize edecek ve nihai raporu uretecek."
              : "Bu sekmede dosyalari sirayla analiz edip detayli grafikli rapor cikarabilir, PDF indirebilir ve suresiz QR kod uretebilirsin."}
          </p>
        </section>

        {activeTab === "current" ? <FileUpload /> : <DesignBuilderOptimization />}
      </div>

      {activeTab === "current" ? (
        <div className="mx-auto mt-8 max-w-6xl">
          <AnalysisHistory />
        </div>
      ) : null}
    </main>
  );
}
