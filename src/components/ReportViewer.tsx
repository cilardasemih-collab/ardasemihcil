"use client";

import { useRef, useState } from "react";
import { Download, Edit3, Loader2, RefreshCcw, Save } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import type { ReportSectionRecord } from "@/types/report";

type ReportViewerProps = {
  reportTitle: string;
  sections: ReportSectionRecord[];
  onRegenerate: (sectionKey: ReportSectionRecord["sectionKey"]) => Promise<void>;
  onSaveEdit: (sectionKey: ReportSectionRecord["sectionKey"], sectionContent: string) => Promise<void>;
};

export default function ReportViewer({ reportTitle, sections, onRegenerate, onSaveEdit }: ReportViewerProps) {
  const exportRootRef = useRef<HTMLDivElement | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = async () => {
    if (!exportRootRef.current || sections.length === 0) return;
    setIsExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const contentWidth = pageWidth - margin * 2;
      const pages = Array.from(exportRootRef.current.querySelectorAll<HTMLElement>("[data-report-page='1']"));
      let firstPage = true;

      for (const page of pages) {
        const canvas = await html2canvas(page, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
        });
        const imgData = canvas.toDataURL("image/png");
        const imgHeight = (canvas.height * contentWidth) / canvas.width;
        if (!firstPage) pdf.addPage();
        firstPage = false;
        let remainingHeight = imgHeight;
        let positionY = margin;
        pdf.addImage(imgData, "PNG", margin, positionY, contentWidth, imgHeight, undefined, "FAST");
        remainingHeight -= pageHeight - margin * 2;

        while (remainingHeight > 0) {
          pdf.addPage();
          positionY = margin - (imgHeight - remainingHeight);
          pdf.addImage(imgData, "PNG", margin, positionY, contentWidth, imgHeight, undefined, "FAST");
          remainingHeight -= pageHeight - margin * 2;
        }
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
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Report Viewer</p>
          <h3 className="mt-1 text-xl font-black text-slate-900">{reportTitle}</h3>
        </div>
        <Button type="button" className="bg-amber-400 text-slate-900 hover:bg-amber-300" onClick={exportPdf} disabled={isExporting || sections.length === 0}>
          {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} PDF Export
        </Button>
      </div>

      <div ref={exportRootRef} className="space-y-6">
        <article data-report-page="1" className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc,#ffffff)] p-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">DesignBuilder Report</p>
          <h2 className="mt-4 text-3xl font-black text-slate-900">{reportTitle}</h2>
          <p className="mt-3 text-sm text-slate-600">Bu rapor moduler bolumler halinde uretilmistir.</p>
        </article>

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

        {sections.map((section) => {
          const isEditing = editingKey === section.sectionKey;
          const currentDraft = drafts[section.sectionKey] ?? section.sectionContent;
          return (
            <article key={section.id} data-report-page="1" className="rounded-[28px] border border-slate-200 bg-white p-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Page {section.sectionOrder + 2}</p>
                  <h4 className="mt-1 text-xl font-black text-slate-900">{section.sectionTitle}</h4>
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
                    {busyKey === section.sectionKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />} Yeniden Uret
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
                      <Edit3 className="mr-2 h-4 w-4" /> Duzenle
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
