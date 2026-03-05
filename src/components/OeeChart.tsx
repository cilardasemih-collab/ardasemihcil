"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type OeeSummary = {
  availabilityBefore: number;
  availabilityAfter: number;
  performanceBefore: number;
  performanceAfter: number;
  qualityBefore: number;
  qualityAfter: number;
  oeeBefore: number;
  oeeAfter: number;
  oeeGain: number;
};

type OeeChartProps = {
  oeeSummary: OeeSummary;
};

const toPercent = (value: number): number => Number((value * 100).toFixed(2));

export default function OeeChart({ oeeSummary }: OeeChartProps) {
  const data = [
    {
      metric: "Availability",
      before: toPercent(oeeSummary.availabilityBefore),
      after: toPercent(oeeSummary.availabilityAfter),
    },
    {
      metric: "Performance",
      before: toPercent(oeeSummary.performanceBefore),
      after: toPercent(oeeSummary.performanceAfter),
    },
    {
      metric: "Quality",
      before: toPercent(oeeSummary.qualityBefore),
      after: toPercent(oeeSummary.qualityAfter),
    },
    {
      metric: "OEE",
      before: toPercent(oeeSummary.oeeBefore),
      after: toPercent(oeeSummary.oeeAfter),
    },
  ];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">OEE Karsilastirma Grafigi</p>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 10, left: 2, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
            <XAxis dataKey="metric" tick={{ fill: "#334155", fontSize: 12 }} />
            <YAxis tickFormatter={(value) => `${value}%`} tick={{ fill: "#334155", fontSize: 12 }} />
            <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} />
            <Legend />
            <Bar dataKey="before" name="Mevcut" fill="#fb923c" radius={[6, 6, 0, 0]} />
            <Bar dataKey="after" name="Optimize" fill="#22c55e" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
