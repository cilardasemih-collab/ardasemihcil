"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import CsvPreviewPanel, { type CsvPreviewData } from "@/components/CsvPreviewPanel";

type AnalysisHistoryItem = {
  id: string;
  file_name: string;
  created_at: string;
  savings_amount: number;
  optimization_method: string;
  old_total_energy: number;
  new_total_energy: number;
  ai_report_markdown: string;
  analysis_payload?: {
    csvPreview?: CsvPreviewData;
    practiceProblems?: string;
    advancedInsights?: string;
    actionPlan?: string[];
  } | null;
};

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export default function AnalysisHistory() {
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [openId, setOpenId] = useState<string>("");

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/analysis-history", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          items?: Array<Record<string, unknown>>;
        };
        const data = Array.isArray(payload.items) ? payload.items : [];

        if (!response.ok || payload.success === false) {
          throw new Error(payload.error ?? "Gecmis analizler okunamadi.");
        }

        const normalized = (data ?? []).map((row) => ({
          id: String(row.id),
          file_name: String(row.file_name ?? "Isimsiz dosya"),
          created_at: String(row.created_at ?? ""),
          savings_amount: Number(row.savings_amount ?? 0),
          optimization_method: String(row.optimization_method ?? "-"),
          old_total_energy: Number(row.old_total_energy ?? 0),
          new_total_energy: Number(row.new_total_energy ?? 0),
          ai_report_markdown: String(row.ai_report_markdown ?? ""),
          analysis_payload:
            row.analysis_payload && typeof row.analysis_payload === "object"
              ? (row.analysis_payload as AnalysisHistoryItem["analysis_payload"])
              : null,
        }));

        setItems(normalized);
      } catch {
        setErrorMessage("Gecmis analizler su an yuklenemiyor. Lutfen birazdan tekrar deneyin.");
      } finally {
        setLoading(false);
      }
    };

    void loadHistory();
  }, []);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-glow backdrop-blur">
      <header className="mb-4">
        <h2 className="text-xl font-bold text-slate-900">Tum Analizler</h2>
        <p className="mt-1 text-sm text-slate-600">Kaydedilen tum mevcut sistem analiz sonuclarini buradan takip edebilirsin.</p>
      </header>

      {loading ? <p className="text-sm text-slate-600">Gecmis analizler yukleniyor...</p> : null}

      {!loading && errorMessage ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{errorMessage}</p>
      ) : null}

      {!loading && !errorMessage && items.length === 0 ? (
        <p className="text-sm text-slate-600">Henuz kaydedilmis analiz bulunmuyor.</p>
      ) : null}

      {!loading && !errorMessage && items.length > 0 ? (
        <div className="grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setOpenId((prev) => (prev === item.id ? "" : item.id))}
              >
                <p className="text-sm font-semibold text-slate-900">{item.file_name}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(item.created_at)}</p>
                <p className="mt-2 text-sm font-bold text-emerald-700">
                  Kazanilan Tasarruf Miktari: {item.savings_amount.toLocaleString("tr-TR")}
                </p>
                <p className="mt-1 text-xs text-slate-500">Detay icin tikla</p>
              </button>

              {openId === item.id ? (
                <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <article className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-500">Eski Tuketim</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{item.old_total_energy.toLocaleString("tr-TR")}</p>
                    </article>
                    <article className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-500">Yeni Tuketim</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{item.new_total_energy.toLocaleString("tr-TR")}</p>
                    </article>
                    <article className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-500">Yontem</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{item.optimization_method}</p>
                    </article>
                  </div>

                  {item.analysis_payload?.csvPreview ? (
                    <CsvPreviewPanel preview={item.analysis_payload.csvPreview} title="Bu Analizde Degerlendirilen Veri" />
                  ) : null}

                  {item.analysis_payload?.practiceProblems ? (
                    <article className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">Ornek Sorular ve Cozumler</p>
                      <div className="prose prose-slate max-w-none prose-headings:text-indigo-900 prose-strong:text-indigo-900">
                        <ReactMarkdown>{item.analysis_payload.practiceProblems}</ReactMarkdown>
                      </div>
                    </article>
                  ) : null}

                  {item.analysis_payload?.advancedInsights ? (
                    <article className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Uzman Icgorusu</p>
                      <div className="prose prose-slate max-w-none prose-headings:text-violet-900 prose-strong:text-violet-900">
                        <ReactMarkdown>{item.analysis_payload.advancedInsights}</ReactMarkdown>
                      </div>
                    </article>
                  ) : null}

                  {Array.isArray(item.analysis_payload?.actionPlan) && item.analysis_payload.actionPlan.length > 0 ? (
                    <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                      <p className="mb-2 text-sm font-bold text-sky-800">OEE Aksiyon Onerileri</p>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-sky-900">
                        {item.analysis_payload.actionPlan.map((plan, index) => (
                          <li key={`${item.id}-${index}-${plan}`}>{plan}</li>
                        ))}
                      </ul>
                    </article>
                  ) : null}

                  {item.ai_report_markdown ? (
                    <article className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Kaydedilen Muhendislik Raporu</p>
                      <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-strong:text-slate-900">
                        <ReactMarkdown>{item.ai_report_markdown}</ReactMarkdown>
                      </div>
                    </article>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
