"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Download, FileBarChart2, Loader2, Play, Plus, QrCode, RefreshCcw, Trash2, Trophy } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { parseDesignBuilderCsv, parseManualUValue } from "@/lib/designbuilder/parser";
import { buildReport, rankReports } from "@/lib/designbuilder/scoring";
import type { DesignBuilderReport, MonthlyPoint, QueueStatus, RankedReport } from "@/lib/designbuilder/types";

type QueueItem = {
  id: string;
  file: File;
  manualUValue: string;
  status: QueueStatus;
  error?: string;
};

type QrItem = {
  id: string;
  label: string;
  value: string;
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
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#0f766e]" /> Air Temp</span>
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#1d4ed8]" /> Operative Temp</span>
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#ea580c]" /> Outside Temp</span>
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
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#ef4444]" /> Heating (Gas)</span>
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#3b82f6]" /> Cooling (Electricity)</span>
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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

  const [qrLabel, setQrLabel] = useState("");
  const [qrValue, setQrValue] = useState("");
  const [qrItems, setQrItems] = useState<QrItem[]>([]);
  const qrCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const pdfRootRef = useRef<HTMLDivElement | null>(null);

  const addSelectedFilesToQueue = () => {
    if (selectedFiles.length === 0) return;

    const created = selectedFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      manualUValue,
      status: "queued" as const,
    }));

    setQueue((prev) => [...prev, ...created]);
    setSelectedFiles([]);
    setManualUValue("");
  };

  const removeQueueItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id || item.status === "processing"));
    setReportsById((prev) => {
      const clone = { ...prev };
      delete clone[id];
      return clone;
    });
  };

  const resetAll = () => {
    if (processing) return;
    setSelectedFiles([]);
    setManualUValue("");
    setQueue([]);
    setReportsById({});
    setProcessingId(null);
  };

  const processQueueSequentially = async () => {
    if (processing) return;

    const pendingIds = queue.filter((item) => item.status === "queued").map((item) => item.id);
    if (pendingIds.length === 0) return;

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

  const queueCounts = useMemo(() => {
    const acc = { queued: 0, processing: 0, completed: 0, failed: 0 };
    for (const item of queue) acc[item.status] += 1;
    return acc;
  }, [queue]);

  const addQr = () => {
    const value = qrValue.trim();
    if (!value) return;

    const item: QrItem = {
      id: `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: qrLabel.trim() || `QR-${qrItems.length + 1}`,
      value,
    };

    setQrItems((prev) => [item, ...prev]);
    setQrLabel("");
    setQrValue("");
  };

  const removeQr = (id: string) => {
    setQrItems((prev) => prev.filter((item) => item.id !== id));
    delete qrCanvasRefs.current[id];
  };

  const downloadQrPng = (item: QrItem) => {
    const canvas = qrCanvasRefs.current[item.id];
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${item.label.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
    link.click();
  };

  const exportPdf = async () => {
    if (!pdfRootRef.current || reports.length === 0) return;

    setIsExportingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const contentWidth = pageWidth - margin * 2;

      const sections = Array.from(pdfRootRef.current.querySelectorAll<HTMLElement>("[data-pdf-section='1']"));
      let firstPage = true;

      for (const section of sections) {
        const canvas = await html2canvas(section, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
        });

        const imgData = canvas.toDataURL("image/png");
        const imgHeight = (canvas.height * contentWidth) / canvas.width;

        if (!firstPage) {
          pdf.addPage();
        }
        firstPage = false;

        let remainingHeight = imgHeight;
        let positionY = margin;
        pdf.addImage(imgData, "PNG", margin, positionY, contentWidth, imgHeight, undefined, "FAST");
        remainingHeight -= pageHeight - margin * 2;

        while (remainingHeight > 0) {
          pdf.addPage();
          positionY = margin - (imgHeight - remainingHeight);
          pdf.addImage(imgData, "PNG", margin, positionY, contentWidth, imgHeight, undefined, "FAST");
          remainingHeight -= pageHeight - margin * 2;
        }
      }

      pdf.save(`designbuilder-rapor-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const generateAiInsights = async () => {
    if (!winner || ranking.length === 0) return;

    const worstHvac = Math.max(...ranking.map((item) => item.hvacTotal));
    const saved = Math.max(0, worstHvac - winner.hvacTotal);

    setIsAiLoading(true);
    setAiError("");
    setAiReport("");
    setAiActionPlan([]);

    try {
      const [reportRes, actionRes] = await Promise.all([
        fetch("/api/generate-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: {
              rowCount: winner.months.length,
              oldTotalEnergy: worstHvac,
              newTotalEnergy: winner.hvacTotal,
              energySaved: saved,
              optimizationMethod: `DesignBuilder U-value karsilastirma (en iyi U: ${winner.uValue ?? "bilinmiyor"})`,
            },
          }),
        }),
        fetch("/api/generate-action-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            optimizationMethod: `DesignBuilder karsilastirma kazanan dosya: ${winner.fileName}`,
          }),
        }),
      ]);

      const reportPayload = (await reportRes.json().catch(() => ({}))) as {
        success?: boolean;
        report?: string;
        error?: string;
      };
      const actionPayload = (await actionRes.json().catch(() => ({}))) as {
        success?: boolean;
        actionPlan?: string[];
        error?: string;
      };

      if (!reportRes.ok || !reportPayload.success) {
        throw new Error(reportPayload.error ?? "AI rapor olusturulamadi.");
      }

      if (!actionRes.ok || !actionPayload.success) {
        throw new Error(actionPayload.error ?? "AI aksiyon plani olusturulamadi.");
      }

      setAiReport(String(reportPayload.report ?? ""));
      setAiActionPlan(Array.isArray(actionPayload.actionPlan) ? actionPayload.actionPlan : []);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI analizinde beklenmeyen hata.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-6" ref={pdfRootRef}>
      <section data-pdf-section="1" className="rounded-3xl border border-cyan-100 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="inline-flex rounded-full border border-cyan-300 bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-800">
              DesignBuilder Optimizasyon
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Coklu Dosya Analizi + U Degeri Karsilastirma</h2>
          </div>
          <button
            type="button"
            onClick={exportPdf}
            disabled={reports.length === 0 || isExportingPdf}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-400 px-3 text-xs font-black text-slate-900 disabled:opacity-50"
          >
            {isExportingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF Indir
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_140px]">
          <label className="rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
            CSV Dosyalari
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              className="mt-2 block w-full text-xs"
              onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
            />
          </label>

          <label className="rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
            U Degeri (ops.)
            <input
              value={manualUValue}
              onChange={(event) => setManualUValue(event.target.value)}
              placeholder="Orn: 0,57"
              className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none"
            />
          </label>

          <button
            type="button"
            onClick={addSelectedFilesToQueue}
            disabled={selectedFiles.length === 0 || processing}
            className="inline-flex h-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            <Plus size={16} /> Kuyruga Ekle
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <MetricCard label="Queued" value={String(queueCounts.queued)} />
          <MetricCard label="Processing" value={String(queueCounts.processing)} />
          <MetricCard label="Completed" value={String(queueCounts.completed)} />
          <MetricCard label="Failed" value={String(queueCounts.failed)} />
        </div>

        <div className="mt-4 space-y-2">
          {queue.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">
              Kuyruk bos. CSV secip ekleyerek baslayabilirsin.
            </p>
          ) : (
            queue.map((item, index) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div>
                  <p className="text-sm font-black text-slate-900">{index + 1}. {item.file.name}</p>
                  <p className="text-xs font-semibold text-slate-600">
                    U: {item.manualUValue || "otomatik"} · Durum: {item.status}
                    {item.error ? ` · Hata: ${item.error}` : ""}
                  </p>
                </div>
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
            {processingId ? "Sirali analiz calisiyor" : "Analizi Baslat"}
          </button>

          <button
            type="button"
            onClick={resetAll}
            disabled={processing}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-300 px-4 text-sm font-black text-slate-700 disabled:opacity-40"
          >
            <RefreshCcw size={16} /> Sifirla
          </button>
        </div>
      </section>

      <section data-pdf-section="1" className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-900">Dosya Bazli Detayli Raporlar</h3>

        {reports.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">
            Henuz rapor uretilmedi.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {reports.map((report) => (
              <article key={report.id} data-pdf-section="1" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-base font-black text-slate-900">{report.fileName}</h4>
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                      U: {report.uValue !== null ? numberFmt(report.uValue, 3) : "bilinmiyor"} · Kaynak: {report.uValueSource}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-700">
                    <FileBarChart2 size={12} /> HVAC: {numberFmt(report.hvacTotal)}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard label="Toplam Heating" value={numberFmt(report.totalHeatingGas)} />
                  <MetricCard label="Toplam Cooling" value={numberFmt(report.totalCoolingElectricity)} />
                  <MetricCard label="Fan + Pump" value={numberFmt(report.totalFans + report.totalPumps)} />
                  <MetricCard label="Comfort Penalty" value={numberFmt(report.comfortPenalty)} />
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div>
                    <p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-slate-600"><BarChart3 size={12} /> Enerji Dagilimi</p>
                    <EnergyChart months={report.months} />
                  </div>
                  <div>
                    <p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-slate-600"><BarChart3 size={12} /> Sicaklik Trendi</p>
                    <TemperatureChart months={report.months} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section data-pdf-section="1" className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-900">Nihai Karsilastirma</h3>

        {!winner ? (
          <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">
            Karsilastirma icin once rapor olustur.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Kazanan Senaryo</p>
              <h4 className="mt-1 inline-flex items-center gap-2 text-lg font-black text-slate-900"><Trophy size={18} /> {winner.fileName}</h4>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                U: {winner.uValue !== null ? numberFmt(winner.uValue, 3) : "bilinmiyor"} · Final Score: {numberFmt(winner.finalScore, 4)}
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-black">Dosya</th>
                    <th className="px-3 py-2 text-left font-black">U Degeri</th>
                    <th className="px-3 py-2 text-left font-black">HVAC</th>
                    <th className="px-3 py-2 text-left font-black">Final Score</th>
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
                        <td className="px-3 py-2">{numberFmt(item.hvacTotal)}</td>
                        <td className="px-3 py-2">{numberFmt(item.finalScore, 4)}</td>
                        <td className="px-3 py-2">
                          {isWinner ? (
                            <span className="inline-flex items-center gap-1 font-black text-emerald-700"><CheckCircle2 size={14} /> En iyi</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-black text-amber-700"><AlertTriangle size={14} /> Karsilastirildi</span>
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
                AI Karsilastirma Raporu Uret
              </button>
            </div>

            {aiError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{aiError}</p>
            ) : null}

            {aiReport ? (
              <article className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">AI Muhendislik Yorumu</p>
                <pre className="whitespace-pre-wrap text-sm text-violet-900">{aiReport}</pre>
              </article>
            ) : null}

            {aiActionPlan.length > 0 ? (
              <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <p className="mb-2 text-sm font-bold text-sky-800">AI Aksiyon Plani</p>
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

      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <h3 className="inline-flex items-center gap-2 text-lg font-black text-slate-900"><QrCode size={18} /> Suresiz QR Olusturucu</h3>
        <p className="mt-2 text-sm font-semibold text-slate-600">Olusturulan QR kodlar sure sinirsizdir ve PNG olarak indirilebilir.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_140px]">
          <label className="rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
            QR Etiketi
            <input
              value={qrLabel}
              onChange={(event) => setQrLabel(event.target.value)}
              placeholder="Orn: Proje Giris"
              className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none"
            />
          </label>

          <label className="rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
            QR Icerigi
            <input
              value={qrValue}
              onChange={(event) => setQrValue(event.target.value)}
              placeholder="https://..."
              className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none"
            />
          </label>

          <button
            type="button"
            onClick={addQr}
            disabled={!qrValue.trim()}
            className="inline-flex h-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            <Plus size={16} /> Olustur
          </button>
        </div>

        {qrItems.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">Henuz QR yok.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {qrItems.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-900">{item.label}</p>
                    <p className="mt-1 break-all text-[11px] font-semibold text-slate-600">{item.value}</p>
                    <p className="mt-1 text-[10px] font-semibold text-emerald-700">Suresiz</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeQr(item.id)}
                    className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-300 px-2 text-xs font-black text-slate-700"
                  >
                    <Trash2 size={12} /> Sil
                  </button>
                </div>

                <div className="mt-3 flex justify-center rounded-2xl bg-white p-3">
                  <QRCodeCanvas
                    value={item.value}
                    size={180}
                    level="H"
                    includeMargin
                    ref={(node) => {
                      qrCanvasRefs.current[item.id] = node;
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => downloadQrPng(item)}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 text-xs font-black text-white"
                >
                  <Download size={14} /> PNG Indir
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
