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
    projectContext?: Record<string, unknown>;
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

const buildZoneLoadChartData = (scenarioSummary: ScenarioSummarySnapshot | null) => {
  if (!scenarioSummary) return [];
  const byZone = new Map<string, { zone: string; heating: number; cooling: number }>();
  for (const item of scenarioSummary.summary.topZonesByHeating.slice(0, 5)) {
    byZone.set(item.zoneName, { zone: item.zoneName, heating: item.value, cooling: byZone.get(item.zoneName)?.cooling ?? 0 });
  }
  for (const item of scenarioSummary.summary.topZonesByCooling.slice(0, 5)) {
    const current = byZone.get(item.zoneName);
    byZone.set(item.zoneName, { zone: item.zoneName, heating: current?.heating ?? 0, cooling: item.value });
  }
  return Array.from(byZone.values())
    .sort((a, b) => b.heating + b.cooling - (a.heating + a.cooling))
    .slice(0, 8);
};

const benchmarkForBuildingType = (buildingType: unknown) => {
  const normalized = String(buildingType ?? "").toLocaleLowerCase("tr-TR");
  if (normalized.includes("hastane")) return { label: "Saglik yapisi norm araligi", low: 220, high: 420 };
  if (normalized.includes("okul")) return { label: "Egitim yapisi norm araligi", low: 80, high: 170 };
  if (normalized.includes("otel")) return { label: "Konaklama norm araligi", low: 180, high: 320 };
  if (normalized.includes("konut")) return { label: "Konut norm araligi", low: 70, high: 150 };
  return { label: "Ofis/ticari norm araligi", low: 90, high: 220 };
};

const sectionCardStyles = [
  "border-cyan-200 bg-cyan-50/70",
  "border-emerald-200 bg-emerald-50/70",
  "border-amber-200 bg-amber-50/70",
  "border-violet-200 bg-violet-50/70",
  "border-rose-200 bg-rose-50/70",
  "border-blue-200 bg-blue-50/70",
  "border-lime-200 bg-lime-50/70",
  "border-fuchsia-200 bg-fuchsia-50/70",
  "border-orange-200 bg-orange-50/70",
  "border-teal-200 bg-teal-50/70",
];

export default function ReportViewer({ reportTitle, sections, onRegenerate, onSaveEdit }: ReportViewerProps) {
  const exportRootRef = useRef<HTMLDivElement | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const scenarioSummary = getScenarioSummary(sections);
  const chartData = buildZoneLoadChartData(scenarioSummary);
  const floorArea = scenarioSummary?.scenario.projectContext?.floorAreaM2;
  const floorAreaM2 = typeof floorArea === "number" && Number.isFinite(floorArea) && floorArea > 0 ? floorArea : null;
  const annualEnergy =
    (scenarioSummary?.summary.metrics.heatingLoad.sum ?? 0) + (scenarioSummary?.summary.metrics.coolingLoad.sum ?? 0);
  const energyIntensity = floorAreaM2 ? annualEnergy / floorAreaM2 : null;
  const benchmark = benchmarkForBuildingType(scenarioSummary?.scenario.projectContext?.buildingType);
  const benchmarkData = [
    { name: "Alt norm", value: benchmark.low },
    { name: "Ust norm", value: benchmark.high },
    { name: "Dosya", value: energyIntensity ?? 0 },
  ];

  const exportPdf = async () => {
    if (sections.length === 0) return;
    setIsExporting(true);
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

      write(reportTitle, 16, 8);
      write("DesignBuilder teknik raporu", 11, 7);
      y += 4;

      if (scenarioSummary) {
        write(`Proje: ${scenarioSummary.scenario.projectName}`, 11);
        write(`Senaryo: ${scenarioSummary.scenario.name}`, 11);
        write(`Konum: ${scenarioSummary.scenario.location ?? "Belirtilmedi"}`, 11);
        write(`Satır: ${scenarioSummary.summary.rowCount} | Zon: ${scenarioSummary.summary.zoneCount}`, 10);
        write(
          `Isıtma: ${numberFmt(scenarioSummary.summary.metrics.heatingLoad.sum)} kWh | Soğutma: ${numberFmt(
            scenarioSummary.summary.metrics.coolingLoad.sum
          )} kWh | Ortalama sıcaklık: ${numberFmt(scenarioSummary.summary.metrics.airTemperature.avg)} C`,
          10
        );
        y += 4;
      }

      for (const section of [...sections].sort((a, b) => a.sectionOrder - b.sectionOrder)) {
        write(`${section.sectionOrder}. ${section.sectionTitle}`, 13, 7);
        write(section.sectionContent || "Bu bölüm henüz tamamlanmamış.", 10, 5.4);
        y += 5;
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
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Rapor Görüntüleyici</p>
          <h3 className="mt-1 text-xl font-black text-slate-900">{reportTitle}</h3>
        </div>
        <Button type="button" className="bg-amber-400 text-slate-900 hover:bg-amber-300" onClick={exportPdf} disabled={isExporting || sections.length === 0}>
          {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} PDF İndir
        </Button>
      </div>

      <div ref={exportRootRef} className="space-y-6">
        <article data-report-page="1" className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc,#ffffff)] p-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">DesignBuilder Raporu</p>
          <h2 className="mt-4 text-3xl font-black text-slate-900">{reportTitle}</h2>
          <p className="mt-3 text-sm text-slate-600">Simülasyon verisi, bölümlü mühendislik yorumu ve performans göstergeleri birlikte sunulmuştur.</p>
        </article>

        {scenarioSummary ? (
          <article data-report-page="1" className="rounded-[28px] border border-slate-200 bg-white p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Performans Özeti</p>
                <h3 className="mt-2 text-2xl font-black text-slate-900">{scenarioSummary.scenario.name}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {scenarioSummary.scenario.projectName} · {scenarioSummary.scenario.location ?? "Konum belirtilmedi"}
                </p>
              </div>
              <div className="text-right text-xs font-semibold text-slate-500">
                {scenarioSummary.summary.rowCount} satır · {scenarioSummary.summary.zoneCount} zon
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {[
                ["Isıtma", `${numberFmt(scenarioSummary.summary.metrics.heatingLoad.sum)} kWh`],
                ["Soğutma", `${numberFmt(scenarioSummary.summary.metrics.coolingLoad.sum)} kWh`],
                ["Ort. Sıcaklık", `${numberFmt(scenarioSummary.summary.metrics.airTemperature.avg)} C`],
                ["Pik Isıtma", numberFmt(scenarioSummary.summary.peaks.heating?.value)],
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
                    <Bar dataKey="heating" name="Isıtma" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cooling" name="Soğutma" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}
            {energyIntensity !== null ? (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-900">Sektör Normu Karşılaştırması</p>
                    <p className="text-xs text-slate-600">{benchmark.label} · kWh/m2-yıl</p>
                  </div>
                  <p className="text-lg font-black text-slate-900">{numberFmt(energyIntensity)} kWh/m2-yil</p>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={benchmarkData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#fde68a" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" name="Enerji Yogunlugu" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
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

        {sections.map((section, sectionIndex) => {
          const isEditing = editingKey === section.sectionKey;
          const currentDraft = drafts[section.sectionKey] ?? section.sectionContent;
          const colorClass = sectionCardStyles[sectionIndex % sectionCardStyles.length];
          return (
            <article key={section.id} data-report-page="1" className={`rounded-[28px] border p-8 ${colorClass}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Page {section.sectionOrder + 2}</p>
                  <h4 className="mt-1 text-xl font-black text-slate-900">{section.sectionTitle}</h4>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    Bu bölüm kendi kartında düzenlenir, kaydedilir veya yeniden üretilir.
                  </p>
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
                    {busyKey === section.sectionKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />} Yeniden Üret
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
                      <Edit3 className="mr-2 h-4 w-4" /> Düzenle
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
