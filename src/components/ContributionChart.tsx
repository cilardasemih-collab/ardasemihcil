"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ColumnContribution = {
  column: string;
  oldValue: number;
  newValue: number;
  saved: number;
};

type Props = {
  data: ColumnContribution[];
};

export default function ContributionChart({ data }: Props) {
  if (!data.length) return null;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Kolon Bazli Tasarruf Katkisi</p>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
            <XAxis type="number" tick={{ fill: "#334155", fontSize: 12 }} />
            <YAxis type="category" dataKey="column" width={120} tick={{ fill: "#334155", fontSize: 12 }} />
            <Tooltip formatter={(value) => Number(value).toLocaleString("tr-TR")} />
            <Bar dataKey="saved" name="Tasarruf" fill="#16a34a" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
