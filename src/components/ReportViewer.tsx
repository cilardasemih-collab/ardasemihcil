"use client";

import { useRef, useState } from "react";
import { Download, Edit3, Loader2, RefreshCcw, Save } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import type { ReportSectionRecord } from "@/types/report";

type ReportViewerProps = {
  reportTitle: string;
  sections: ReportSectionRecord[];
  onRegenerate: (sectionKey: ReportSectionRecord["sectionKey"]) => Promise<void>;
  onSaveEdit: (sectionKey: ReportSectionRecord["sectionKey"], sectionContent: string) => Promise<void>;
};

type ScenarioSummarySnapshot = {
  scenario: {
    name: string;
    projectName: string;
    location: string | null;
  };
  summary: {
    rowCount: number;
    zoneCount: number;
    metrics: {
      airTemperature: { avg: number | null; min: number | null; max: number | null };
      heatingLoad: { sum: number | null; avg: number | null; max: number | null };
      coolingLoad: { sum: number | null; avg: number | null; max: number | null };
      humidity: { avg: number | null };
    };
    peaks: {
      heating: { value: number; zoneName: string } | null;
      cooling: { value: number; zoneName: string } | null;
    };
    topZonesByHeating: Array<{ zoneName: string; value: number }>;
    topZonesByCooling: Array<{ zoneName: string; value: number }>;
    detectedAnomalies: string[];
  };
};

const isScenarioSummarySnapshot = (value: unknown): value is ScenarioSummarySnapshot => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { scenario?: unknown; summary?: unknown };
  return Boolean(candidate.scenario && candidate.summary);
};

const getScenarioSummary = (sections: ReportSectionRecord[]) => {
  for (const section of sections) {
    const snapshot = section.contextSnapshot?.scenarioSummary;
    if (isScenarioSummarySnapshot(snapshot)) return snapshot;
  }
  return null;
};

const numberFmt = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value) : "-";

export default function ReportViewer({ reportTitle, sections, onRegenerate, onSaveEdit }: ReportViewerProps) {
  const exportRootRef = useRef<HTMLDivElement | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const scenarioSummary = getScenarioSummary(sections);
  const chartData = scenarioSummary
    ? [
        ...scenarioSummary.summary.topZonesByHeating.slice(0, 5).map((item) => ({
          zone: item.zoneName,
          heating: item.value,
          cooling: 0,
        })),
        ...scenarioSummary.summary.topZonesByCooling.slice(0, 5).map((item) => ({
          zone: item.zoneName,
          heating: 0,
          cooling: item.value,
        })),
      ].slice(0, 8)
    : [];

  const exportPdf = async () => {
    if (!exportRootRef.current || sections.length === 0) return;
    setIsExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const contentWidth = pageWidth - margin * 2;
      const pages = Array.from(exportRootRef.current.querySelectorAll<HTMLElement>("[data-report-page='1']"));
      let firstPage = true;

      for (const page of pages) {
        const canvas = await html2canvas(page, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
        });
        const imgData = canvas.toDataURL("image/png");
        const imgHeight = (canvas.height * contentWidth) / canvas.width;
        if (!firstPage) pdf.addPage();
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

      pdf.save(`designbuilder-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Report Viewer</p>
          <h3 className="mt-1 text-xl font-black text-slate-900">{reportTitle}</h3>
        </div>
        <Button type="button" className="bg-amber-400 text-slate-900 hover:bg-amber-300" onClick={exportPdf} disabled={isExporting || sections.length === 0}>
          {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} PDF Export
        </Button>
      </div>

      <div ref={exportRootRef} className="space-y-6">
        <article data-report-page="1" className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc,#ffffff)] p-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">DesignBuilder Report</p>
          <h2 className="mt-4 text-3xl font-black text-slate-900">{reportTitle}</h2>
          <p className="mt-3 text-sm text-slate-600">Simulasyon verisi, bolumlu muhendislik yorumu ve performans gostergeleri birlikte sunulmustur.</p>
        </article>

        {scenarioSummary ? (
          <article data-report-page="1" className="rounded-[28px] border border-slate-200 bg-white p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Performans Ozeti</p>
                <h3 className="mt-2 text-2xl font-black text-slate-900">{scenarioSummary.scenario.name}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {scenarioSummary.scenario.projectName} · {scenarioSummary.scenario.location ?? "Konum belirtilmedi"}
                </p>
              </div>
              <div className="text-right text-xs font-semibold text-slate-500">
                {scenarioSummary.summary.rowCount} satir · {scenarioSummary.summary.zoneCount} zon
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {[
                ["Isitma", `${numberFmt(scenarioSummary.summary.metrics.heatingLoad.sum)} kWh`],
                ["Sogutma", `${numberFmt(scenarioSummary.summary.metrics.coolingLoad.sum)} kWh`],
                ["Ort. Sicaklik", `${numberFmt(scenarioSummary.summary.metrics.airTemperature.avg)} C`],
                ["Pik Isitma", numberFmt(scenarioSummary.summary.peaks.heating?.value)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
                  <p className="mt-2 text-xl font-black text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            {chartData.length > 0 ? (
              <div className="mt-6 h-72 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="zone" tick={{ fontSize: 11 }} interval={0} height={54} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="heating" name="Isitma" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cooling" name="Sogutma" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </article>
        ) : null}

        <article data-report-page="1" className="rounded-[28px] border border-slate-200 bg-white p-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Icindekiler</p>
          <ol className="mt-4 space-y-2 text-sm text-slate-800">
            {sections.map((section) => (
              <li key={section.id}>
                {section.sectionOrder}. {section.sectionTitle}
              </li>
            ))}
          </ol>
        </article>

        {sections.map((section) => {
          const isEditing = editingKey === section.sectionKey;
          const currentDraft = drafts[section.sectionKey] ?? section.sectionContent;
          return (
            <article key={section.id} data-report-page="1" className="rounded-[28px] border border-slate-200 bg-white p-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Page {section.sectionOrder + 2}</p>
                  <h4 className="mt-1 text-xl font-black text-slate-900">{section.sectionTitle}</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyKey === section.sectionKey}
                    onClick={async () => {
                      setBusyKey(section.sectionKey);
                      try {
                        await onRegenerate(section.sectionKey);
                      } finally {
                        setBusyKey(null);
                      }
                    }}
                  >
                    {busyKey === section.sectionKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />} Yeniden Uret
                  </Button>
                  {isEditing ? (
                    <Button
                      type="button"
                      className="bg-emerald-600 hover:bg-emerald-500"
                      disabled={busyKey === section.sectionKey}
                      onClick={async () => {
                        setBusyKey(section.sectionKey);
                        try {
                          await onSaveEdit(section.sectionKey, currentDraft);
                          setEditingKey(null);
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                    >
                      <Save className="mr-2 h-4 w-4" /> Kaydet
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => setEditingKey(section.sectionKey)}>
                      <Edit3 className="mr-2 h-4 w-4" /> Duzenle
                    </Button>
                  )}
                </div>
              </div>

              {isEditing ? (
                <textarea
                  value={currentDraft}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [section.sectionKey]: event.target.value }))}
                  className="min-h-[380px] w-full rounded-2xl border border-slate-300 p-4 text-sm text-slate-900 outline-none"
                />
              ) : (
                <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-strong:text-slate-900">
                  <ReactMarkdown>{section.sectionContent}</ReactMarkdown>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
