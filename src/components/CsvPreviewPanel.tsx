type NumericSummaryItem = {
  column: string;
  avg: number;
  min: number;
  max: number;
};

export type CsvPreviewData = {
  headers: string[];
  rows: Array<Record<string, string>>;
  numericSummary: NumericSummaryItem[];
};

type Props = {
  preview: CsvPreviewData;
  title?: string;
};

const numberFormat = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 2,
});

export default function CsvPreviewPanel({ preview, title = "Degerlendirilen CSV Onizleme" }: Props) {
  const maxAvg = Math.max(...preview.numericSummary.map((item) => item.avg), 1);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>

      {preview.numericSummary.length > 0 ? (
        <div className="mb-4 grid gap-2">
          {preview.numericSummary.map((item) => {
            const width = Math.max(6, Math.round((item.avg / maxAvg) * 100));
            return (
              <div key={item.column} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-600">
                  <span className="truncate font-semibold text-slate-700">{item.column}</span>
                  <span>
                    Ort: {numberFormat.format(item.avg)} | Min: {numberFormat.format(item.min)} | Max: {numberFormat.format(item.max)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              {preview.headers.map((header) => (
                <th key={header} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, index) => (
              <tr key={`csv-preview-${index}`} className="border-b border-slate-100 last:border-none">
                {preview.headers.map((header) => (
                  <td key={`${index}-${header}`} className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {row[header] || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
