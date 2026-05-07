"use client";

import { useMemo } from "react";
import { ScatterChart, Scatter, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, LineChart, Line } from "recharts";
import ReactMarkdown from "react-markdown";
import { Crown } from "lucide-react";

import type { OptimizationComparisonResult, OptimizationScenarioDossier } from "@/services/optimizationService";

type OptimizationDashboardProps = {
  result: OptimizationComparisonResult;
};

const numberFmt = (value: number, digits = 2) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(value);

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
      result.scenarios.map((scenario) => ({
        x: scenario.capex,
        y: scenario.annualEnergyKwh,
        z: scenario.finalScore,
        name: scenario.scenarioName,
      })),
    [result.scenarios]
  );

  return (
    <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="rounded-[28px] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5,#f8fafc)] p-6">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Winner Card</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="inline-flex items-center gap-2 text-2xl font-black text-slate-900">
              <Crown className="h-6 w-6 text-amber-500" /> {result.winner.scenarioName}
            </h3>
            <p className="mt-2 text-sm text-slate-700">
              Final Score: {numberFmt(result.winner.finalScore, 3)} · ROI: {result.winner.roiYears !== null ? numberFmt(result.winner.roiYears, 2) : "-"} yil
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Yillik Enerji</p>
              <p className="mt-1 text-lg font-black text-slate-900">{numberFmt(result.winner.annualEnergyKwh)} kWh</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Karbon</p>
              <p className="mt-1 text-lg font-black text-slate-900">{numberFmt(result.winner.annualCarbonKg)} kgCO2/yil</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm font-black text-slate-900">Enerji Trendleri</p>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="4 4" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                {result.scenarios.map((scenario, index) => (
                  <Line
                    key={scenario.scenarioId}
                    type="monotone"
                    dataKey={scenario.scenarioName}
                    stroke={["#0f766e", "#1d4ed8", "#ea580c", "#9333ea", "#dc2626"][index % 5]}
                    strokeWidth={2.5}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm font-black text-slate-900">Pareto Benzeri Dagilim</p>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="4 4" />
                <XAxis type="number" dataKey="x" name="CAPEX" unit=" TL" />
                <YAxis type="number" dataKey="y" name="Energy" unit=" kWh" />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={scatterData} fill="#0f766e" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-black text-slate-900">Scenario Scoreboard</p>
        <div className="space-y-2">
          {result.scenarios.map((scenario) => (
            <ScenarioRow key={scenario.scenarioId} scenario={scenario} isWinner={scenario.scenarioId === result.winner.scenarioId} />
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-4">
        <p className="mb-2 text-sm font-black text-cyan-900">Stratejist Ajan Karar Ozeti</p>
        <div className="prose prose-slate max-w-none prose-headings:text-cyan-950">
          <ReactMarkdown>{result.strategistSummary}</ReactMarkdown>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-2 text-sm font-black text-slate-900">LaTeX Karsilastirma Tablosu</p>
        <pre className="overflow-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100">{result.latexTable}</pre>
      </div>
    </div>
  );
}

function ScenarioRow({ scenario, isWinner }: { scenario: OptimizationScenarioDossier; isWinner: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${isWinner ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">{scenario.scenarioName}</p>
          <p className="mt-1 text-xs text-slate-600">{scenario.explanation.join(" · ")}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Score</p>
          <p className="text-lg font-black text-slate-900">{numberFmt(scenario.finalScore, 3)}</p>
        </div>
      </div>
    </div>
  );
}
