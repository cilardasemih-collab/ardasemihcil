"use client";

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
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-[#08111f] p-5 text-slate-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-300">AI Status Terminal</p>
          <p className="mt-1 text-sm text-slate-300">
            {isRunning
              ? "Multi-agent analiz calisiyor."
              : report
                ? "Son teknik rapor hazir."
                : "Senaryo analizi henuz baslatilmadi."}
          </p>
        </div>
        <div className="text-right text-[11px] text-slate-400">
          <p>Dil: {language.toUpperCase()}</p>
          <p>{provider && model ? `${provider} / ${model}` : "Model secilmedi"}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#020817] p-4 font-mono text-xs">
        {trace.length === 0 ? (
          <p className="text-slate-400">&gt; Terminal beklemede...</p>
        ) : (
          <div className="space-y-2">
            {trace.map((item, index) => (
              <p key={`${index}-${item.stage}`} className="text-emerald-300">
                <span className="text-cyan-400">&gt;</span> [{item.stage}] {item.message}
              </p>
            ))}
          </div>
        )}
        {error ? <p className="mt-3 text-rose-300">&gt; [error] {error}</p> : null}
      </div>

      {report ? (
        <article className="rounded-2xl border border-cyan-900/70 bg-cyan-950/30 p-4">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-cyan-300">Final Report</p>
          <div className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{report}</div>
        </article>
      ) : null}
    </div>
  );
}
