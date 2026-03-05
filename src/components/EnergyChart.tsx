"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type EnergyChartProps = {
  oldTotalEnergy: number;
  newTotalEnergy: number;
};

const formatValue = (value: number): string => value.toLocaleString("tr-TR");

export default function EnergyChart({ oldTotalEnergy, newTotalEnergy }: EnergyChartProps) {
  const chartData = [
    { name: "Mevcut Durum", value: oldTotalEnergy, color: "#f97316" },
    { name: "Optimize Durum", value: newTotalEnergy, color: "#10b981" },
  ];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Enerji Karsilastirma Grafigi</p>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 6 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fill: "#334155", fontSize: 12 }} />
            <YAxis tickFormatter={(value) => formatValue(Number(value))} tick={{ fill: "#334155", fontSize: 12 }} />
            <Tooltip formatter={(value) => formatValue(Number(value))} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
