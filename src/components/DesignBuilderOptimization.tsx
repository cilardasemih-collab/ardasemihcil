"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Download, FileBarChart2, Loader2, Play, Plus, RefreshCcw, Trash2, Trophy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { buildDesignBuilderInsightPayload } from "@/lib/designbuilder/insights";
import { parseDesignBuilderCsv, parseManualUValue } from "@/lib/designbuilder/parser";
import { buildReport, rankReports } from "@/lib/designbuilder/scoring";
import type { DesignBuilderInsightPayload, DesignBuilderReport, MonthlyPoint, QueueStatus, RankedReport } from "@/lib/designbuilder/types";

type QueueItem = {
  id: string;
  file: File;
  manualUValue: string;
  status: QueueStatus;
  error?: string;
};

const numberFmt = (value: number, maximumFractionDigits = 2) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits }).format(value);

function TemperatureChart({ months }: { months: MonthlyPoint[] }) {
  const width = 760;
  const height = 220;
  const padding = 26;

  const values = months.flatMap((item) => [item.airTemp, item.operativeTemp, item.outsideTemp]);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 30);
  const range = Math.max(1, max - min);

  const x = (index: number) => {
    if (months.length <= 1) return padding;
    return padding + (index / (months.length - 1)) * (width - padding * 2);
  };

  const y = (value: number) => padding + ((max - value) / range) * (height - padding * 2);

  const toLine = (selector: (item: MonthlyPoint) => number) =>
    months.map((item, index) => `${x(index)},${y(selector(item))}`).join(" ");

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#d1d5db] bg-white p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px]">
        {[0, 1, 2, 3, 4].map((step) => {
          const value = min + ((max - min) / 4) * step;
          const posY = y(value);
          return (
            <g key={step}>
              <line x1={padding} y1={posY} x2={width - padding} y2={posY} stroke="#e2e8f0" strokeDasharray="4 5" />
              <text x={4} y={posY + 4} fontSize="11" fill="#64748b">
                {numberFmt(value, 1)}
              </text>
            </g>
          );
        })}

        <polyline fill="none" stroke="#0f766e" strokeWidth="2.5" points={toLine((item) => item.airTemp)} />
        <polyline fill="none" stroke="#1d4ed8" strokeWidth="2.5" points={toLine((item) => item.operativeTemp)} />
        <polyline fill="none" stroke="#ea580c" strokeWidth="2.5" points={toLine((item) => item.outsideTemp)} />

        {months.map((item, index) => (
          <text key={`${item.label}-${index}`} x={x(index) - 12} y={height - 6} fontSize="10" fill="#475569">
            {item.label.slice(0, 2)}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-[#334155]">
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#0f766e]" /> Hava Sıcaklığı</span>
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#1d4ed8]" /> Operatif Sıcaklık</span>
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#ea580c]" /> Dış Sıcaklık</span>
      </div>
    </div>
  );
}

function EnergyChart({ months }: { months: MonthlyPoint[] }) {
  const max = Math.max(1, ...months.map((item) => Math.max(item.heatingGas, item.coolingElectricity)));

  return (
    <div className="rounded-2xl border border-[#d1d5db] bg-white p-3">
      <div className="space-y-2">
        {months.map((item) => (
          <div key={item.label} className="grid grid-cols-[56px_1fr_64px_64px] items-center gap-2 text-xs">
            <span className="font-bold text-[#334155]">{item.label.slice(0, 2)}</span>
            <div className="relative h-6 rounded-md bg-[#f1f5f9]">
              <div className="absolute left-0 top-0 h-3 rounded-md bg-[#ef4444]" style={{ width: `${(item.heatingGas / max) * 100}%` }} />
              <div className="absolute left-0 bottom-0 h-3 rounded-md bg-[#3b82f6]" style={{ width: `${(item.coolingElectricity / max) * 100}%` }} />
            </div>
            <span className="text-right font-semibold text-[#7f1d1d]">{numberFmt(item.heatingGas)}</span>
            <span className="text-right font-semibold text-[#1e3a8a]">{numberFmt(item.coolingElectricity)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-[#334155]">
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#ef4444]" /> Isıtma (Gaz)</span>
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#3b82f6]" /> Soğutma (Elektrik)</span>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

export default function DesignBuilderOptimization() {
  const [manualUValue, setManualUValue] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reportsById, setReportsById] = useState<Record<string, DesignBuilderReport>>({});
  const [processing, setProcessing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiReport, setAiReport] = useState("");
  const [aiActionPlan, setAiActionPlan] = useState<string[]>([]);
  const [aiMeta, setAiMeta] = useState<{ fallbackUsed: boolean; model: string | null } | null>(null);


  const resetAiInsights = () => {
    setAiError("");
    setAiReport("");
    setAiActionPlan([]);
    setAiMeta(null);
  };

  const addFilesToQueue = (files: File[]) => {
    if (files.length === 0) return;

    const created = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      manualUValue,
      status: "queued" as const,
    }));

    resetAiInsights();
    setQueue((prev) => [...prev, ...created]);
    setManualUValue("");
  };

  const handleFileSelection = (files: FileList | null, input: HTMLInputElement) => {
    const selected = Array.from(files ?? []);
    addFilesToQueue(selected);
    input.value = "";
  };

  const updateQueueManualUValue = (id: string, value: string) => {
    resetAiInsights();
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, manualUValue: value } : item)));
  };

  const removeQueueItem = (id: string) => {
    resetAiInsights();
    setQueue((prev) => prev.filter((item) => item.id !== id || item.status === "processing"));
    setReportsById((prev) => {
      const clone = { ...prev };
      delete clone[id];
      return clone;
    });
  };

  const resetAll = () => {
    if (processing) return;
    resetAiInsights();
    setManualUValue("");
    setQueue([]);
    setReportsById({});
    setProcessingId(null);
  };

  const processQueueSequentially = async () => {
    if (processing) return;

    const pendingIds = queue.filter((item) => item.status === "queued").map((item) => item.id);
    if (pendingIds.length === 0) return;

    resetAiInsights();
    setProcessing(true);

    for (const id of pendingIds) {
      const item = queue.find((row) => row.id === id);
      if (!item) continue;

      setProcessingId(id);
      setQueue((prev) => prev.map((row) => (row.id === id ? { ...row, status: "processing", error: undefined } : row)));

      try {
        const content = await item.file.text();
        const parsed = parseDesignBuilderCsv(content, item.file.name);
        const report = buildReport({
          id,
          fileName: item.file.name,
          manualU: parseManualUValue(item.manualUValue),
          detectedU: parsed.detectedUValue,
          detectedUValueSource: parsed.detectedUValueSource,
          sourceNotes: parsed.sourceNotes,
          months: parsed.months,
        });

        setReportsById((prev) => ({ ...prev, [id]: report }));
        setQueue((prev) => prev.map((row) => (row.id === id ? { ...row, status: "completed" } : row)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Beklenmeyen analiz hatasi";
        setQueue((prev) => prev.map((row) => (row.id === id ? { ...row, status: "failed", error: message } : row)));
      }
    }

    setProcessingId(null);
    setProcessing(false);
  };

  const reports = useMemo(() => {
    return queue.map((item) => reportsById[item.id]).filter((item): item is DesignBuilderReport => Boolean(item));
  }, [queue, reportsById]);

  const ranking = useMemo<RankedReport[]>(() => rankReports(reports), [reports]);
  const winner = ranking[0] ?? null;
  const insightPayload = useMemo<DesignBuilderInsightPayload>(() => buildDesignBuilderInsightPayload(ranking), [ranking]);
  const recommendation = insightPayload.recommendation;

  const queueCounts = useMemo(() => {
    const acc = { queued: 0, processing: 0, completed: 0, failed: 0 };
    for (const item of queue) acc[item.status] += 1;
    return acc;
  }, [queue]);

  const exportPdf = async () => {
    if (reports.length === 0) return;

    setIsExportingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 14;
      const maxWidth = 182;
      let y = 18;
      const write = (text: string, fontSize = 10, lineHeight = 6) => {
        pdf.setFontSize(fontSize);
        const lines = pdf.splitTextToSize(text.replace(/\n{3,}/g, "\n\n"), maxWidth);
        for (const line of lines) {
          if (y > pageHeight - margin) {
            pdf.addPage();
            y = 18;
          }
          pdf.text(line, margin, y);
          y += lineHeight;
        }
      };

      write("DesignBuilder Optimizasyon Raporu", 16, 8);
      if (winner) {
        write(`Önerilen senaryo: ${winner.fileName}`, 12, 7);
        write(`Toplam skor: ${numberFmt(winner.finalScore, 4)}`, 10);
      }

      write("Senaryo Özetleri", 13, 8);
      for (const report of reports) {
        write(
          `${report.fileName}: Sistem enerjisi ${numberFmt(report.totalSystemEnergy)} kWh, konfor cezası ${numberFmt(
            report.comfortPenalty
          )}, sıcaklık salınımı ${numberFmt(report.temperatureSwing)} C, U değeri ${report.uValue ?? "-"}`,
          10
        );
      }

      if (ranking.length > 0) {
        write("Sıralama", 13, 8);
        for (const [index, ranked] of ranking.entries()) {
          write(
            `${index + 1}. ${ranked.fileName} - Nihai skor: ${numberFmt(ranked.finalScore, 4)} - Sistem enerjisi: ${numberFmt(
              ranked.totalSystemEnergy
            )} kWh`,
            10
          );
        }
      }

      if (aiReport) {
        write("AI Karşılaştırma Raporu", 13, 8);
        write(aiReport, 10, 5.4);
      }

      if (aiActionPlan.length > 0) {
        write("Aksiyon Planı", 13, 8);
        for (const item of aiActionPlan) write(`- ${item}`, 10);
      }

      pdf.save(`designbuilder-rapor-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  };
  const generateAiInsights = async () => {
    if (!winner || ranking.length === 0) return;

    setIsAiLoading(true);
    setAiError("");
    setAiReport("");
    setAiActionPlan([]);
    setAiMeta(null);

    try {
      const response = await fetch("/api/designbuilder-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reports }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        markdown?: string;
        actionPlan?: string[];
        fallbackUsed?: boolean;
        model?: string | null;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "AI rapor olusturulamadi.");
      }

      setAiReport(String(payload.markdown ?? ""));
      setAiActionPlan(Array.isArray(payload.actionPlan) ? payload.actionPlan : []);
      setAiMeta({
        fallbackUsed: Boolean(payload.fallbackUsed),
        model: payload.model ?? null,
      });
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI analizinde beklenmeyen hata.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-cyan-100 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="inline-flex rounded-full border border-cyan-300 bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-800">
              DesignBuilder Optimizasyon
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Çoklu Dosya Analizi + U Değeri Karşılaştırma</h2>
          </div>
          <button
            type="button"
            onClick={exportPdf}
            disabled={reports.length === 0 || isExportingPdf}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-400 px-3 text-xs font-black text-slate-900 disabled:opacity-50"
          >
            {isExportingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF İndir
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_140px]">
          <label className="rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
            CSV Dosyaları
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              className="mt-2 block w-full text-xs"
              onChange={(event) => handleFileSelection(event.target.files, event.currentTarget)}
            />
          </label>

          <label className="rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
            U Değeri (ops.)
            <input
              value={manualUValue}
              onChange={(event) => setManualUValue(event.target.value)}
              placeholder="Örn: 0,57"
              className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none"
            />
          </label>

          <div className="flex h-full items-center rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-xs font-black text-cyan-900">
            <Plus size={16} className="mr-2" /> Dosya seçince otomatik kuyruğa eklenir
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <MetricCard label="Bekleyen" value={String(queueCounts.queued)} />
          <MetricCard label="İşleniyor" value={String(queueCounts.processing)} />
          <MetricCard label="Tamamlandı" value={String(queueCounts.completed)} />
          <MetricCard label="Hatalı" value={String(queueCounts.failed)} />
        </div>

        <div className="mt-4 space-y-2">
          {queue.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">
              Kuyruk boş. CSV seçtiğinde dosyalar otomatik eklenir.
            </p>
          ) : (
            queue.map((item, index) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm font-black text-slate-900">{index + 1}. {item.file.name}</p>
                  <p className="text-xs font-semibold text-slate-600">
                    U: {item.manualUValue || "otomatik"} · Durum: {item.status}
                    {item.error ? ` · Hata: ${item.error}` : ""}
                  </p>
                </div>
                <label className="min-w-[140px] flex-1 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
                  U Değeri
                  <input
                    value={item.manualUValue}
                    onChange={(event) => updateQueueManualUValue(item.id, event.target.value)}
                    placeholder="0,57"
                    disabled={item.status === "processing" || processing}
                    className="mt-1 h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none disabled:opacity-50"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeQueueItem(item.id)}
                  disabled={item.status === "processing" || processing}
                  className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-300 px-2 text-xs font-black text-slate-700 disabled:opacity-40"
                >
                  <Trash2 size={12} /> Sil
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={processQueueSequentially}
            disabled={processing || queue.every((item) => item.status !== "queued")}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-black text-white disabled:opacity-50"
          >
            {processing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {processingId ? "Sıralı analiz çalışıyor" : "Analizi Başlat"}
          </button>

          <button
            type="button"
            onClick={resetAll}
            disabled={processing}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-300 px-4 text-sm font-black text-slate-700 disabled:opacity-40"
          >
            <RefreshCcw size={16} /> Sıfırla
          </button>
        </div>
      </section>

      <div className="space-y-6">
      <section data-pdf-section="1" className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-900">Dosya Bazlı Detaylı Raporlar</h3>

        {reports.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">
            Henüz rapor üretilmedi.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {reports.map((report) => (
              <article key={report.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-black text-slate-900">{report.fileName}</h4>
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        U: {report.uValue !== null ? numberFmt(report.uValue, 3) : "bilinmiyor"} · Kaynak: {report.uValueSource}
                      </p>
                      {report.sourceNotes.length > 0 ? (
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">{report.sourceNotes.join(" ")}</p>
                      ) : null}
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-700">
                      <FileBarChart2 size={12} /> Sistem: {numberFmt(report.totalSystemEnergy)}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard label="Toplam Isıtma" value={numberFmt(report.totalHeatingGas)} />
                    <MetricCard label="Toplam Soğutma" value={numberFmt(report.totalCoolingElectricity)} />
                    <MetricCard label="Toplam Sistem" value={numberFmt(report.totalSystemEnergy)} />
                    <MetricCard label="Konfor Bandı" value={`%${numberFmt(report.comfortBandRate * 100, 1)}`} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">HVAC: {numberFmt(report.hvacTotal)}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Fan + Pompa: {numberFmt(report.totalParasiticEnergy)}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Sıcaklık Salınımı: {numberFmt(report.temperatureSwing, 2)} C</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Tepe Isıtma: {report.peakHeatingMonth ?? "-"}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Tepe Soğutma: {report.peakCoolingMonth ?? "-"}</span>
                  </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div>
                    <p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-slate-600"><BarChart3 size={12} /> Enerji Dağılımı</p>
                    <EnergyChart months={report.months} />
                  </div>
                  <div>
                    <p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-slate-600"><BarChart3 size={12} /> Sıcaklık Trendi</p>
                    <TemperatureChart months={report.months} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section data-pdf-section="1" className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-900">Nihai Karşılaştırma</h3>

        {!winner ? (
          <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">
            Karşılaştırma için önce rapor oluştur.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Kazanan Senaryo</p>
              <h4 className="mt-1 inline-flex items-center gap-2 text-lg font-black text-slate-900"><Trophy size={18} /> {winner.fileName}</h4>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                U: {winner.uValue !== null ? numberFmt(winner.uValue, 3) : "bilinmiyor"} · Nihai Skor: {numberFmt(winner.finalScore, 4)}
              </p>
            </div>

            {recommendation ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Önerilen U"
                    value={recommendation.recommendedUValue !== null ? numberFmt(recommendation.recommendedUValue, 3) : "eksik"}
                  />
                  <MetricCard label="Güven" value={`${recommendation.confidenceLabel} (${recommendation.confidenceScore}/100)`} />
                  <MetricCard label="Sistem Tasarrufu" value={`%${numberFmt(recommendation.savingsVsReferencePct, 2)}`} />
                  <MetricCard label="HVAC Tasarrufu" value={`%${numberFmt(recommendation.hvacSavingsVsReferencePct, 2)}`} />
                </div>

                <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
                  <p className="text-sm font-black text-cyan-900">Karar Özeti</p>
                  <p className="mt-2 text-sm font-semibold text-cyan-950">{recommendation.reasonSummary}</p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-cyan-700">Güçlü Gerekçeler</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-cyan-950">
                        {recommendation.reasons.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-cyan-700">Dikkat Noktaları</p>
                      {recommendation.watchouts.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-cyan-950">
                          {recommendation.watchouts.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm font-semibold text-cyan-950">Bu veri setinde belirgin bir ek risk notu oluşmadı.</p>
                      )}
                    </div>
                  </div>
                </div>

                {insightPayload.trendPoints.length > 0 ? (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-sm font-black text-slate-900">U Değeri Trendi</p>
                      <p className="text-xs font-semibold text-slate-600">
                        Trend: {recommendation.trendDirection} · Test aralığı: {recommendation.testedRange ? `${numberFmt(recommendation.testedRange[0], 3)} - ${numberFmt(recommendation.testedRange[1], 3)}` : "yetersiz"}
                      </p>
                    </div>
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-white text-slate-700">
                        <tr>
                          <th className="px-3 py-2 text-left font-black">Dosya</th>
                          <th className="px-3 py-2 text-left font-black">U</th>
                          <th className="px-3 py-2 text-left font-black">Sistem</th>
                          <th className="px-3 py-2 text-left font-black">Konfor</th>
                          <th className="px-3 py-2 text-left font-black">Skor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                        {insightPayload.trendPoints.map((item) => (
                          <tr key={`${item.fileName}-${item.uValue}`}>
                            <td className="px-3 py-2 font-semibold">{item.fileName}</td>
                            <td className="px-3 py-2">{numberFmt(item.uValue, 3)}</td>
                            <td className="px-3 py-2">{numberFmt(item.totalSystemEnergy)}</td>
                            <td className="px-3 py-2">%{numberFmt(item.comfortBandRate * 100, 1)}</td>
                            <td className="px-3 py-2">{numberFmt(item.finalScore, 4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {insightPayload.monthlyDeltas.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-black text-slate-900">Aylık En İyi Kazanım</p>
                      <p className="mt-2 text-sm font-semibold text-slate-700">
                        {insightPayload.biggestSavingsMonth?.label ?? "-"} ayında toplam sistem iyileşmesi {numberFmt(Math.abs(insightPayload.biggestSavingsMonth?.systemEnergyDelta ?? 0))} kWh.
                      </p>
                    </article>
                    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-black text-slate-900">Aylık En Zayıf Nokta</p>
                      <p className="mt-2 text-sm font-semibold text-slate-700">
                        {insightPayload.biggestPenaltyMonth?.label ?? "-"} ayında toplam sistem sapması {numberFmt(Math.max(0, insightPayload.biggestPenaltyMonth?.systemEnergyDelta ?? 0))} kWh.
                      </p>
                    </article>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-black">Dosya</th>
                    <th className="px-3 py-2 text-left font-black">U Değeri</th>
                    <th className="px-3 py-2 text-left font-black">Sistem</th>
                    <th className="px-3 py-2 text-left font-black">HVAC</th>
                    <th className="px-3 py-2 text-left font-black">Konfor</th>
                    <th className="px-3 py-2 text-left font-black">Nihai Skor</th>
                    <th className="px-3 py-2 text-left font-black">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {ranking.map((item) => {
                    const isWinner = winner.id === item.id;
                    return (
                      <tr key={item.id} className={isWinner ? "bg-emerald-50" : ""}>
                        <td className="px-3 py-2 font-semibold">{item.fileName}</td>
                        <td className="px-3 py-2">{item.uValue !== null ? numberFmt(item.uValue, 3) : "-"}</td>
                        <td className="px-3 py-2">{numberFmt(item.totalSystemEnergy)}</td>
                        <td className="px-3 py-2">{numberFmt(item.hvacTotal)}</td>
                        <td className="px-3 py-2">%{numberFmt(item.comfortBandRate * 100, 1)}</td>
                        <td className="px-3 py-2">{numberFmt(item.finalScore, 4)}</td>
                        <td className="px-3 py-2">
                          {isWinner ? (
                            <span className="inline-flex items-center gap-1 font-black text-emerald-700"><CheckCircle2 size={14} /> En iyi</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-black text-amber-700"><AlertTriangle size={14} /> Karşılaştırıldı</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={generateAiInsights}
                disabled={isAiLoading}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-3 text-xs font-black text-white disabled:opacity-60"
              >
                {isAiLoading ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
                AI Karşılaştırma Raporu Üret
              </button>
            </div>

            {aiError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{aiError}</p>
            ) : null}

            {aiReport ? (
              <article className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">AI Mühendislik Yorumu</p>
                <div className="prose prose-sm max-w-none text-violet-950">
                  <ReactMarkdown>{aiReport}</ReactMarkdown>
                </div>
                {aiMeta ? (
                  <p className="mt-3 text-[11px] font-semibold text-violet-700">
                    {aiMeta.fallbackUsed ? "Yerel teknik yedek analiz kullanıldı." : `Model: ${aiMeta.model ?? "AI"}`}
                  </p>
                ) : null}
              </article>
            ) : null}

            {aiActionPlan.length > 0 ? (
              <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <p className="mb-2 text-sm font-bold text-sky-800">AI Aksiyon Planı</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-sky-900">
                  {aiActionPlan.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </article>
            ) : null}
          </div>
        )}
      </section>
      </div>

    </div>
  );
}
