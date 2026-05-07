"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, GitCompare, Loader2, Save, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import type { ReportSectionRecord } from "@/types/report";

type FeedbackKind = "error" | "preference";

type ReportEditorProps = {
  reportGroupId: string;
  language: "tr" | "en";
  sections: ReportSectionRecord[];
  onSectionsChanged: () => Promise<void>;
};

const buildLineDiff = (original: string, current: string) => {
  const originalLines = original.split("\n");
  const currentLines = current.split("\n");
  const max = Math.max(originalLines.length, currentLines.length);
  const rows: Array<{ type: "same" | "added" | "removed" | "changed"; text: string }> = [];

  for (let index = 0; index < max; index += 1) {
    const before = originalLines[index] ?? "";
    const after = currentLines[index] ?? "";
    if (before === after) {
      rows.push({ type: "same", text: after });
    } else if (!before && after) {
      rows.push({ type: "added", text: after });
    } else if (before && !after) {
      rows.push({ type: "removed", text: before });
    } else {
      rows.push({ type: "changed", text: `- ${before}\n+ ${after}` });
    }
  }

  return rows;
};

export default function ReportEditor({ reportGroupId, language, sections, onSectionsChanged }: ReportEditorProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [diffKey, setDiffKey] = useState<string | null>(null);
  const [feedbackKey, setFeedbackKey] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>("error");
  const [feedbackType, setFeedbackType] = useState("Mevzuat Hatasi");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSelection, setFeedbackSelection] = useState("");
  const [refiningKey, setRefiningKey] = useState<string | null>(null);

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const section of sections) {
        if (!(section.sectionKey in next)) {
          next[section.sectionKey] = section.sectionContent;
        }
      }
      return next;
    });
  }, [sections]);

  useEffect(() => {
    const pending = Object.entries(drafts).filter(([key, value]) => {
      const section = sections.find((item) => item.sectionKey === key);
      return section && section.sectionContent !== value;
    });

    if (pending.length === 0) return;
    const timeout = window.setTimeout(async () => {
      const [sectionKey, sectionContent] = pending[0];
      setSavingKey(sectionKey);
      try {
        await fetch("/api/reports/section", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportGroupId,
            sectionKey,
            sectionContent,
          }),
        });
        await onSectionsChanged();
      } finally {
        setSavingKey(null);
      }
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [drafts, onSectionsChanged, reportGroupId, sections]);

  const diffRowsByKey = useMemo(() => {
    return Object.fromEntries(
      sections.map((section) => [
        section.sectionKey,
        buildLineDiff(section.initialSectionContent ?? section.sectionContent, drafts[section.sectionKey] ?? section.sectionContent),
      ])
    ) as Record<string, Array<{ type: "same" | "added" | "removed" | "changed"; text: string }>>;
  }, [drafts, sections]);

  const submitFeedback = async (section: ReportSectionRecord) => {
    const originalText = feedbackSelection || (drafts[section.sectionKey] ?? section.sectionContent);
    await fetch("/api/reports/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportGroupId,
        sectionKey: section.sectionKey,
        errorType: feedbackType,
        feedbackKind,
        originalText,
        correctedText: null,
        engineerNote: feedbackNote,
      }),
    });
    setFeedbackKey(null);
    setFeedbackNote("");
    setFeedbackSelection("");
  };

  const refineSection = async (section: ReportSectionRecord) => {
    setRefiningKey(section.sectionKey);
    try {
      await fetch("/api/reports/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportGroupId,
          sectionKey: section.sectionKey,
          engineerNote: feedbackNote || "Metni teknik olarak daha dogru ve net hale getir.",
          language,
        }),
      });
      await onSectionsChanged();
      setFeedbackKey(null);
      setFeedbackNote("");
      setFeedbackSelection("");
    } finally {
      setRefiningKey(null);
    }
  };

  return (
    <div className="space-y-5">
      {sections.map((section) => {
        const value = drafts[section.sectionKey] ?? section.sectionContent;
        const showDiff = diffKey === section.sectionKey;
        const showFeedback = feedbackKey === section.sectionKey;
        const diffRows = diffRowsByKey[section.sectionKey] ?? [];

        return (
          <article key={section.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{section.sectionTitle}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Review: {section.reviewStatus} · Son kaynak: {section.lastEditedSource}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setDiffKey(showDiff ? null : section.sectionKey)}>
                  <GitCompare className="mr-2 h-4 w-4" /> Degisiklikleri Gor
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFeedbackKey(showFeedback ? null : section.sectionKey);
                    setFeedbackSelection(window.getSelection?.()?.toString().trim() ?? "");
                  }}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" /> Hata Bildir
                </Button>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Markdown Editor</p>
                  <textarea
                    value={value}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, [section.sectionKey]: event.target.value }))}
                    className="min-h-[320px] w-full rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-900 outline-none"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>Markdown, tablo ve $LaTeX$ notasyonu desteklenir.</span>
                    {savingKey === section.sectionKey ? (
                      <span className="inline-flex items-center gap-1 text-cyan-700"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Autosave</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-700"><Save className="h-3.5 w-3.5" /> Kayit hazir</span>
                    )}
                  </div>
                </div>

                {showFeedback ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-black text-amber-900">Inline Feedback</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="text-sm font-semibold text-slate-700">
                        Tur
                        <select
                          value={feedbackKind}
                          onChange={(event) => setFeedbackKind(event.target.value === "preference" ? "preference" : "error")}
                          className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                        >
                          <option value="error">Hata</option>
                          <option value="preference">Tercih</option>
                        </select>
                      </label>
                      <label className="text-sm font-semibold text-slate-700">
                        Hata Tipi
                        <input
                          value={feedbackType}
                          onChange={(event) => setFeedbackType(event.target.value)}
                          className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                        />
                      </label>
                    </div>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                      Duzeltme Notu
                      <textarea
                        value={feedbackNote}
                        onChange={(event) => setFeedbackNote(event.target.value)}
                        className="mt-1 min-h-[120px] w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900"
                        placeholder="Dogrusu su olmali..."
                      />
                    </label>
                    {feedbackSelection ? (
                      <p className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                        Secili metin: {feedbackSelection}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => void submitFeedback(section)} disabled={!feedbackNote.trim()}>
                        Feedback Kaydet
                      </Button>
                      <Button
                        type="button"
                        className="bg-violet-600 hover:bg-violet-500"
                        onClick={() => void refineSection(section)}
                        disabled={!feedbackNote.trim() || refiningKey === section.sectionKey}
                      >
                        {refiningKey === section.sectionKey ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Geri Bildirimle Yeniden Uret
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Live Preview</p>
                  <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-strong:text-slate-900">
                    <ReactMarkdown>{value}</ReactMarkdown>
                  </div>
                </div>

                {showDiff ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Diff View</p>
                    <div className="space-y-1 font-mono text-xs">
                      {diffRows.map((row, index) => (
                        <pre
                          key={`${section.sectionKey}-${index}`}
                          className={`whitespace-pre-wrap rounded-lg px-3 py-2 ${
                            row.type === "added"
                              ? "bg-emerald-100 text-emerald-900"
                              : row.type === "removed"
                                ? "bg-rose-100 text-rose-900"
                                : row.type === "changed"
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-white text-slate-600"
                          }`}
                        >
                          {row.text || " "}
                        </pre>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
