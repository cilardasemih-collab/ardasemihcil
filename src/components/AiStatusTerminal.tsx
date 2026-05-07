"use client";

import { Terminal, Zap, CheckCircle2, AlertCircle } from "lucide-react";

type TraceItem = {
  stage: "preprocess" | "analyst" | "auditor" | "reporter" | "completed";
  message: string;
};

type AiStatusTerminalProps = {
  isRunning: boolean;
  trace: TraceItem[];
  report: string;
  error: string;
  language: "tr" | "en";
  model: string;
  provider: string;
};

const stageIcons = {
  preprocess: "📊",
  analyst: "🔍",
  auditor: "✅",
  reporter: "📝",
  completed: "🎉",
};

export default function AiStatusTerminal({
  isRunning,
  trace,
  report,
  error,
  language,
  model,
  provider,
}: AiStatusTerminalProps) {
  return (
    <div className="space-y-5 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-slate-100 shadow-lg">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Terminal className="h-6 w-6 text-cyan-400" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-300">🤖 AI Durum Terminali</p>
            <p className="mt-2 text-sm text-slate-300">
              {isRunning
                ? "Multi-agent analiz çalışıyor..."
                : report
                  ? "Teknik rapor hazır."
                  : "Analiz henüz başlatılmadı."}
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-slate-800/50 px-3 py-2 text-right text-xs text-slate-400">
          <p className="font-semibold">Dil: <span className="text-cyan-300">{language.toUpperCase()}</span></p>
          <p className="mt-1">Model: <span className="text-cyan-300">{provider && model ? `${provider} / ${model}` : "Seçilmedi"}</span></p>
        </div>
      </div>

      {/* Terminal Log */}
      <div className="rounded-2xl border border-slate-700 bg-slate-950/80 p-5 font-mono text-xs leading-relaxed">
        {trace.length === 0 && !error ? (
          <p className="text-slate-500">$ Terminali Başlat...</p>
        ) : (
          <div className="space-y-2">
            {trace.map((item, index) => (
              <div key={`${index}-${item.stage}`} className="flex gap-2">
                <span className="text-cyan-400 font-bold">$</span>
                <span className="text-slate-300">
                  <span className="text-emerald-400">{stageIcons[item.stage as keyof typeof stageIcons]}</span>
                  <span className="text-slate-500 ml-2">[{item.stage}]</span>
                  <span className="text-slate-100 ml-2">{item.message}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="mt-4 flex gap-2 text-rose-400">
            <span className="font-bold">$</span>
            <span>
              <AlertCircle className="inline h-4 w-4 mr-1" />
              <span className="text-rose-300">{error}</span>
            </span>
          </div>
        )}
      </div>

      {/* Report Output */}
      {report && (
        <article className="rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-cyan-950/50 to-cyan-900/30 p-5">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-300">✅ Son Teknik Rapor</p>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg bg-slate-950/50 p-4 text-xs leading-6 text-slate-100 border border-slate-700">
            <pre className="whitespace-pre-wrap font-mono">{report}</pre>
          </div>
        </article>
      )}

      {/* Status Indicator */}
      <div className="flex items-center justify-between rounded-xl bg-slate-800/30 px-4 py-2 border border-slate-700">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isRunning ? "animate-pulse bg-cyan-400" : "bg-slate-600"}`} />
          <span className="text-xs text-slate-400">
            {isRunning ? "İşleniyor" : trace.length > 0 ? "Tamamlandı" : "Hazır"}
          </span>
        </div>
        <span className="text-xs text-slate-500">{trace.length} adım</span>
      </div>
    </div>
  );
}
