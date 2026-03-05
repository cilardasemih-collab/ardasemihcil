"use client";

type AnomalyItem = {
  rowIndex: number;
  column: string;
  value: number;
  zScore: number;
};

type Props = {
  anomalies: AnomalyItem[];
};

export default function AnomalyTable({ anomalies }: Props) {
  if (!anomalies.length) return null;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Top Anomaliler (Bakim Onceligi)</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">Satir</th>
              <th className="px-2 py-2">Kolon</th>
              <th className="px-2 py-2">Deger</th>
              <th className="px-2 py-2">Z-Score</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.map((item) => (
              <tr key={`${item.rowIndex}-${item.column}`} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-2 font-medium text-slate-700">{item.rowIndex}</td>
                <td className="px-2 py-2 text-slate-700">{item.column}</td>
                <td className="px-2 py-2 text-slate-700">{item.value.toLocaleString("tr-TR")}</td>
                <td className="px-2 py-2 font-semibold text-rose-700">{item.zScore.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
