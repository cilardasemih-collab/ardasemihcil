"use client";

import { CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import { REPORT_SECTION_DEFINITIONS, type ReportSectionRecord } from "@/types/report";

type ReportGenerationStepperProps = {
  sections: ReportSectionRecord[];
  isGenerating: boolean;
};

export default function ReportGenerationStepper({ sections, isGenerating }: ReportGenerationStepperProps) {
  const byKey = new Map(sections.map((section) => [section.sectionKey, section]));
  const completedCount = sections.filter((s) => s.status === "completed").length;
  const totalCount = REPORT_SECTION_DEFINITIONS.length;

  return (
    <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">📋 Rapor Üretim İşlemi</p>
          <p className="mt-2 text-base font-bold text-slate-900">
            {isGenerating 
              ? `${completedCount}/${totalCount} bölüm tamamlandı...` 
              : completedCount === totalCount 
                ? "Tüm bölümler hazır!"
                : `${completedCount}/${totalCount} bölüm tamamlandı.`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-slate-900">{Math.round((completedCount / totalCount) * 100)}%</div>
          <p className="text-xs font-semibold text-slate-600">ilerleme</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6 h-3 rounded-full bg-slate-200 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
          style={{ width: `${(completedCount / totalCount) * 100}%` }}
        />
      </div>

      {/* Status Grid */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
        {REPORT_SECTION_DEFINITIONS.map((definition) => {
          const section = byKey.get(definition.key);
          const status = section?.status ?? "pending";
          
          const styleConfig = {
            completed: { border: "border-emerald-300", bg: "bg-emerald-50", text: "text-emerald-900", icon: CheckCircle2 },
            generating: { border: "border-cyan-300", bg: "bg-cyan-50", text: "text-cyan-900", icon: Loader2 },
            failed: { border: "border-rose-300", bg: "bg-rose-50", text: "text-rose-900", icon: AlertCircle },
            pending: { border: "border-slate-200", bg: "bg-white", text: "text-slate-700", icon: Clock },
          };

          const config = styleConfig[status as keyof typeof styleConfig] || styleConfig.pending;
          const IconComponent = config.icon;

          return (
            <div key={definition.key} className={`rounded-2xl border ${config.border} ${config.bg} p-4 transition hover:shadow-md`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Bölüm {definition.order}</p>
                  <p className={`mt-2 text-sm font-bold ${config.text}`}>{definition.shortLabel}</p>
                </div>
                <IconComponent className={`h-5 w-5 ${config.text} flex-shrink-0 ${status === "generating" ? "animate-spin" : ""}`} />
              </div>
              <p className={`mt-3 text-xs font-semibold capitalize ${config.text}`}>{status === "pending" ? "Beklemede" : status === "generating" ? "İşleniyor" : status === "completed" ? "Tamamlandı" : "Hata"}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
