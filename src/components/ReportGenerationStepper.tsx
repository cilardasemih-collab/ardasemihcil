"use client";

import { REPORT_SECTION_DEFINITIONS, type ReportSectionRecord } from "@/types/report";

type ReportGenerationStepperProps = {
  sections: ReportSectionRecord[];
  isGenerating: boolean;
};

export default function ReportGenerationStepper({ sections, isGenerating }: ReportGenerationStepperProps) {
  const byKey = new Map(sections.map((section) => [section.sectionKey, section]));

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Generation Stepper</p>
          <p className="mt-1 text-sm text-slate-700">
            {isGenerating ? "Rapor bolumleri sirayla uretiliyor." : "Bolum durumlari asagida canli olarak gorunur."}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        {REPORT_SECTION_DEFINITIONS.map((definition) => {
          const section = byKey.get(definition.key);
          const status = section?.status ?? "pending";
          const styles =
            status === "completed"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : status === "generating"
                ? "border-cyan-300 bg-cyan-50 text-cyan-900"
                : status === "failed"
                  ? "border-rose-300 bg-rose-50 text-rose-900"
                  : "border-slate-200 bg-slate-50 text-slate-700";

          return (
            <div key={definition.key} className={`rounded-2xl border p-3 transition ${styles}`}>
              <p className="text-[11px] font-black uppercase tracking-[0.12em]">{definition.order}. Adim</p>
              <p className="mt-2 text-sm font-black">{definition.shortLabel}</p>
              <p className="mt-2 text-xs font-semibold capitalize">{status}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
