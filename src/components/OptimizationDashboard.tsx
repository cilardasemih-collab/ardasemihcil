"use client";

import { useMemo } from "react";
import { ScatterChart, Scatter, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, LineChart, Line, Area, AreaChart } from "recharts";
import ReactMarkdown from "react-markdown";
import { Crown, TrendingDown, Zap, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { OptimizationComparisonResult, OptimizationScenarioDossier } from "@/services/optimizationService";

type OptimizationDashboardProps = {
  result: OptimizationComparisonResult;
};

const numberFmt = (value: number, digits = 2) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(value);

const addPdfText = (
  pdf: import("jspdf").jsPDF,
  text: string,
  x: number,
  y: number,
  options: { fontSize?: number; maxWidth?: number; lineHeight?: number } = {}
) => {
  const pageHeight = pdf.internal.pageSize.getHeight();
  const lineHeight = options.lineHeight ?? 6;
  pdf.setFontSize(options.fontSize ?? 10);
  const lines = pdf.splitTextToSize(text, options.maxWidth ?? 180);
  for (const line of lines) {
    if (y > pageHeight - 16) {
      pdf.addPage();
      y = 18;
    }
    pdf.text(line, x, y);
    y += lineHeight;
  }
  return y;
};

const handleExportPdf = async (result: OptimizationComparisonResult) => {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF("p", "mm", "a4");
  let y = 18;

  pdf.setTextColor(15, 23, 42);
  y = addPdfText(pdf, "DesignBuilder Karşılaştırma Raporu", 14, y, { fontSize: 18, lineHeight: 9 });
  y = addPdfText(pdf, `Kazanan Senaryo: ${result.winner.scenarioName}`, 14, y + 3, { fontSize: 13, lineHeight: 7 });
  y = addPdfText(pdf, `Toplam Skor: ${numberFmt(result.winner.finalScore, 3)}`, 14, y, { fontSize: 11 });
  y = addPdfText(pdf, `Yıllık Enerji: ${numberFmt(result.winner.annualEnergyKwh)} kWh`, 14, y);
  y = addPdfText(pdf, `Yıllık Maliyet: ${result.currency.symbol}${numberFmt(result.winner.annualOpexEstimate)} ${result.currency.code}`, 14, y);
  y = addPdfText(pdf, `Karbon Salımı: ${numberFmt(result.winner.annualCarbonKg)} kgCO2/yıl`, 14, y);

  y = addPdfText(pdf, "Senaryo Karşılaştırması", 14, y + 6, { fontSize: 14, lineHeight: 8 });
  for (const scenario of result.scenarios) {
    y = addPdfText(
      pdf,
      `${scenario.scenarioName}: Enerji ${numberFmt(scenario.annualEnergyKwh, 0)} kWh, CAPEX ${result.currency.symbol}${numberFmt(
        scenario.capex,
        0
      )}, Karbon ${numberFmt(scenario.annualCarbonKg, 0)} kg, Skor ${numberFmt(scenario.finalScore, 2)}`,
      14,
      y,
      { maxWidth: 180 }
    );
  }

  y = addPdfText(pdf, "Bölüm Bazlı Kazananlar", 14, y + 6, { fontSize: 14, lineHeight: 8 });
  for (const item of result.sectionWinners) {
    y = addPdfText(pdf, `${item.sectionTitle}: ${item.winnerScenarioName} - ${item.reason}`, 14, y, { maxWidth: 180 });
  }

  y = addPdfText(pdf, "Stratejist Karar Özeti", 14, y + 6, { fontSize: 14, lineHeight: 8 });
  addPdfText(pdf, result.strategistSummary, 14, y, { maxWidth: 180 });

  pdf.save(`designbuilder-karsilastirma-${new Date().toISOString().slice(0, 10)}.pdf`);
};

export default function OptimizationDashboard({ result }: OptimizationDashboardProps) {
  const lineData = useMemo(() => {
    const labels = ["Q1", "Q2", "Q3", "Q4"];
    return labels.map((label, index) => {
      const row: Record<string, string | number> = { label };
      result.scenarios.forEach((scenario) => {
        row[scenario.scenarioName] = scenario.monthlyTrend[index]?.total ?? 0;
      });
      return row;
    });
  }, [result.scenarios]);

  const scatterData = useMemo(
    () =>
      result.scenarios.map((scenario, idx) => ({
        x: scenario.capex,
        y: scenario.annualEnergyKwh,
        z: scenario.finalScore,
        name: scenario.scenarioName,
        fill: ["#16a34a", "#0084ff", "#ff6b35", "#9333ea", "#dc2626"][idx % 5],
      })),
    [result.scenarios]
  );

  return (
    <div className="space-y-6 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-6 shadow-lg">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Optimizasyon Özeti</p>
          <p className="mt-2 text-base text-slate-700">
            Para Birimi: <span className="font-bold text-slate-900">{result.currency.code}</span> ({result.currency.symbol})
          </p>
        </div>
        <Button
          onClick={() => void handleExportPdf(result)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
        >
          📥 PDF İndir
        </Button>
      </div>

      {/* Winner Card - Large & Impressive */}
      <div className="rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50 via-emerald-50 to-emerald-100 p-8 shadow-md">
        <div className="flex items-center justify-between gap-6">
          <div>
            <h3 className="inline-flex items-center gap-3 text-3xl font-black text-slate-900">
              <Crown className="h-8 w-8 text-amber-500" /> {result.winner.scenarioName}
            </h3>
            <p className="mt-3 text-base text-slate-700">
              Tüm kriterler dengesi göz önüne alındığında en iyi seçim
            </p>
          </div>
          <div className="text-right">
            <p className="text-5xl font-black text-emerald-700">{numberFmt(result.winner.finalScore, 2)}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Toplam Skor</p>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white/80 px-4 py-3 backdrop-blur">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Yıllık Enerji</p>
            <p className="mt-2 text-xl font-black text-slate-900">{numberFmt(result.winner.annualEnergyKwh, 0)}</p>
            <p className="text-xs text-slate-600">kWh</p>
          </div>
          <div className="rounded-xl bg-white/80 px-4 py-3 backdrop-blur">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Yıllık Maliyet</p>
            <p className="mt-2 text-xl font-black text-slate-900">{result.currency.symbol}{numberFmt(result.winner.annualOpexEstimate, 0)}</p>
            <p className="text-xs text-slate-600">{result.currency.code}</p>
          </div>
          <div className="rounded-xl bg-white/80 px-4 py-3 backdrop-blur">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Karbon Salımı</p>
            <p className="mt-2 text-xl font-black text-slate-900">{numberFmt(result.winner.annualCarbonKg, 0)}</p>
            <p className="text-xs text-slate-600">kgCO₂/yıl</p>
          </div>
          <div className="rounded-xl bg-white/80 px-4 py-3 backdrop-blur">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">ROI Süresi</p>
            <p className="mt-2 text-xl font-black text-slate-900">{result.winner.roiYears !== null ? numberFmt(result.winner.roiYears, 1) : "Hemen"}</p>
            <p className="text-xs text-slate-600">yıl</p>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Energy Trends */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-500" />
            <p className="font-bold text-slate-900">Enerji Trendleri (Çeyreklik)</p>
          </div>
          <div style={{ width: "100%", height: 300, minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px" }}
                  formatter={(value) => [numberFmt(Number(value), 0), ""]}
                />
                <Legend />
                {result.scenarios.map((scenario, index) => (
                  <Area
                    key={scenario.scenarioId}
                    type="monotone"
                    dataKey={scenario.scenarioName}
                    stroke={["#0f766e", "#1d4ed8", "#ea580c", "#9333ea", "#dc2626"][index % 5]}
                    fill={["#a7f3d0", "#bfdbfe", "#fed7aa", "#e9d5ff", "#fecaca"][index % 5]}
                    strokeWidth={2}
                    opacity={0.6}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ROI vs Energy */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-blue-500" />
            <p className="font-bold text-slate-900">CAPEX vs Enerji Tüketimi</p>
          </div>
          <div style={{ width: "100%", height: 300, minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  type="number" 
                  dataKey="x" 
                  name="CAPEX" 
                  unit={` ${result.currency.symbol}`}
                  stroke="#64748b"
                />
                <YAxis 
                  type="number" 
                  dataKey="y" 
                  name="Enerji" 
                  unit=" kWh"
                  stroke="#64748b"
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px" }}
                  cursor={{ fillOpacity: 0.1 }}
                  formatter={(value) => numberFmt(Number(value), 0)}
                />
                <Scatter 
                  name="Senaryolar"
                  data={scatterData}
                  fill="#3b82f6"
                  shape="circle"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Scenario Comparison Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Leaf className="h-5 w-5 text-green-600" />
          <p className="font-bold text-slate-900">Senaryo Karşılaştırması</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-bold text-slate-900">Senaryo</th>
                <th className="px-4 py-3 text-right font-bold text-slate-900">Enerji (kWh)</th>
                <th className="px-4 py-3 text-right font-bold text-slate-900">CAPEX</th>
                <th className="px-4 py-3 text-right font-bold text-slate-900">Karbon (kg)</th>
                <th className="px-4 py-3 text-right font-bold text-slate-900">ROI (yıl)</th>
                <th className="px-4 py-3 text-right font-bold text-slate-900">Konfor</th>
                <th className="px-4 py-3 text-right font-bold text-slate-900">Skor</th>
              </tr>
            </thead>
            <tbody>
              {result.scenarios.map((scenario, idx) => (
                <tr 
                  key={scenario.scenarioId}
                  className={`border-b transition ${
                    scenario.scenarioId === result.winner.scenarioId
                      ? "bg-emerald-50"
                      : idx % 2 === 0 ? "bg-slate-50" : "bg-white"
                  }`}
                >
                  <td className={`px-4 py-3 font-bold ${scenario.scenarioId === result.winner.scenarioId ? "text-emerald-700" : "text-slate-900"}`}>
                    {scenario.scenarioName}
                    {scenario.scenarioId === result.winner.scenarioId && <span className="ml-2 text-amber-500">★</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{numberFmt(scenario.annualEnergyKwh, 0)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{result.currency.symbol}{numberFmt(scenario.capex, 0)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{numberFmt(scenario.annualCarbonKg, 0)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{scenario.roiYears !== null ? numberFmt(scenario.roiYears, 1) : "-"}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{numberFmt(scenario.comfortScore, 0)}/100</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">{numberFmt(scenario.finalScore, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-500" />
          <p className="font-bold text-slate-900">Bölüm Bazlı Kazananlar</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {result.sectionWinners.map((item, index) => (
            <article
              key={item.sectionKey}
              className={`rounded-2xl border p-4 ${
                item.winnerScenarioId === result.winner.scenarioId
                  ? "border-emerald-200 bg-emerald-50"
                  : index % 2 === 0
                    ? "border-cyan-200 bg-cyan-50"
                    : "border-violet-200 bg-violet-50"
              }`}
            >
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                {index + 1}. adim
              </p>
              <h4 className="mt-1 text-sm font-black text-slate-900">{item.sectionTitle}</h4>
              <p className="mt-2 text-sm font-bold text-slate-800">Galip: {item.winnerScenarioName}</p>
              <p className="mt-2 text-xs leading-5 text-slate-700">{item.reason}</p>
              <p className="mt-2 text-xs font-black text-slate-500">Bölüm skoru: {numberFmt(item.score, 2)}</p>
            </article>
          ))}
        </div>
      </div>

      {/* Strategist Summary */}
      <div className="rounded-2xl border-2 border-cyan-200 bg-gradient-to-br from-cyan-50 to-cyan-100 p-6">
        <p className="mb-4 text-sm font-black uppercase tracking-[0.12em] text-cyan-900">📊 Stratejist Ajan Karar Özeti</p>
        <div className="prose prose-slate max-w-none text-slate-800 text-sm leading-relaxed">
          <ReactMarkdown>{result.strategistSummary}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
