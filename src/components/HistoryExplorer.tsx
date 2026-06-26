"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronDown, FileText, History, Loader2, Trophy } from "lucide-react";
import ReactMarkdown from "react-markdown";

type HistoryItem =
  | {
      id: string;
      type: "csv_analysis";
      title: string;
      created_at: string;
      summary: {
        savingsAmount: number;
        oldTotalEnergy: number;
        newTotalEnergy: number;
        optimizationMethod: string;
      };
      report: string;
      payload: unknown;
    }
  | {
      id: string;
      type: "designbuilder_report";
      title: string;
      created_at: string;
      projectName: string;
      scenarioName: string;
      location: string | null;
      totalEnergyConsumption: number | null;
      summary: {
        completedCount: number;
        totalCount: number;
        status: string;
      };
      sections: Array<{
        id: string;
        title: string;
        order: number;
        status: string;
        content: string;
      }>;
    }
  | {
      id: string;
      type: "designbuilder_comparison";
      title: string;
      created_at: string;
      projectName: string;
      winnerScenarioName: string | null;
      scenarioIds: string[];
      payload: unknown;
    };

type FilterKey = "all" | HistoryItem["type"];

type ComparisonPayload = {
  strategistSummary?: string;
  scenarios?: Array<{ scenarioId: string; scenarioName: string; finalScore: number; annualEnergyKwh: number }>;
  sectionWinners?: Array<{ sectionTitle: string; winnerScenarioName: string; reason: string; score: number }>;
};

const filters: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Tum Kayitlar" },
  { key: "csv_analysis", label: "Mevcut Sistem" },
  { key: "designbuilder_report", label: "DesignBuilder Rapor" },
  { key: "designbuilder_comparison", label: "Karsilastirma" },
];

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const numberFmt = (value: number | null | undefined, maximumFractionDigits = 2) =>
  value === null || value === undefined
    ? "-"
    : new Intl.NumberFormat("tr-TR", { maximumFractionDigits }).format(value);

const getTypeMeta = (type: HistoryItem["type"]) => {
  if (type === "csv_analysis") {
    return { label: "Mevcut Sistem", icon: FileText, className: "border-cyan-200 bg-cyan-50 text-cyan-800" };
  }
  if (type === "designbuilder_report") {
    return { label: "DesignBuilder Rapor", icon: BarChart3, className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  }
  return { label: "Karsilastirma", icon: Trophy, className: "border-amber-200 bg-amber-50 text-amber-800" };
};

const asComparisonPayload = (value: unknown): ComparisonPayload => {
  if (!value || typeof value !== "object") return {};
  return value as ComparisonPayload;
};

export default function HistoryExplorer() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openId, setOpenId] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/history", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          items?: HistoryItem[];
          warnings?: string[];
        };

        if (!response.ok || payload.success === false) {
          throw new Error(payload.error ?? "Gecmis kayitlari okunamadi.");
        }

        setItems(Array.isArray(payload.items) ? payload.items : []);
        setWarnings(Array.isArray(payload.warnings) ? payload.warnings : []);
      } catch {
        setErrorMessage("Gecmis kayitlari su an yuklenemiyor.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const filteredItems = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.type === filter)),
    [filter, items]
  );

  const counts = useMemo(
    () => ({
      all: items.length,
      csv_analysis: items.filter((item) => item.type === "csv_analysis").length,
      designbuilder_report: items.filter((item) => item.type === "designbuilder_report").length,
      designbuilder_comparison: items.filter((item) => item.type === "designbuilder_comparison").length,
    }),
    [items]
  );

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-600">
              <History className="h-3.5 w-3.5" />
              Kayit Merkezi
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight text-slate-900 md:text-5xl">Gecmis Sonuclar</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-600">
              Mevcut sistem analizleri, DesignBuilder bolumlu raporlari ve karsilastirma sonuclari burada birlikte listelenir.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Toplam Kayit</p>
            <p className="text-3xl font-black text-slate-900">{items.length}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                filter === item.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {item.label} ({counts[item.key]})
            </button>
          ))}
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {warnings.join(" ")}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Gecmis kayitlari yukleniyor...
        </div>
      ) : null}

      {!loading && errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {!loading && !errorMessage && filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Bu filtrede kayit bulunmuyor.</div>
      ) : null}

      <div className="space-y-3">
        {filteredItems.map((item) => {
          const meta = getTypeMeta(item.type);
          const Icon = meta.icon;
          const isOpen = openId === item.id;

          return (
            <article key={`${item.type}-${item.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <button type="button" className="w-full text-left" onClick={() => setOpenId(isOpen ? "" : item.id)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                    <h2 className="mt-3 break-words text-lg font-black text-slate-900">{item.title}</h2>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(item.created_at)}</p>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-slate-500 transition ${isOpen ? "rotate-180" : ""}`} />
                </div>

                {item.type === "csv_analysis" ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Metric label="Tasarruf" value={numberFmt(item.summary.savingsAmount)} tone="emerald" />
                    <Metric label="Eski Tuketim" value={numberFmt(item.summary.oldTotalEnergy)} />
                    <Metric label="Yeni Tuketim" value={numberFmt(item.summary.newTotalEnergy)} />
                  </div>
                ) : null}

                {item.type === "designbuilder_report" ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Metric label="Proje" value={item.projectName} />
                    <Metric label="Senaryo" value={item.scenarioName} />
                    <Metric label="Bolum" value={`${item.summary.completedCount}/${item.summary.totalCount}`} tone="emerald" />
                  </div>
                ) : null}

                {item.type === "designbuilder_comparison" ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Metric label="Proje" value={item.projectName} />
                    <Metric label="Kazanan" value={item.winnerScenarioName ?? "-"} tone="amber" />
                    <Metric label="Senaryo Sayisi" value={String(item.scenarioIds.length)} />
                  </div>
                ) : null}
              </button>

              {isOpen ? <HistoryDetails item={item} /> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "emerald" | "amber" }) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-50 text-slate-900";

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <p className="text-xs font-semibold opacity-70">{label}</p>
      <p className="mt-1 break-words text-sm font-black">{value}</p>
    </div>
  );
}

function HistoryDetails({ item }: { item: HistoryItem }) {
  if (item.type === "csv_analysis") {
    return (
      <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
        <Metric label="Optimizasyon Yontemi" value={item.summary.optimizationMethod} />
        {item.report ? (
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Kayitli Rapor</p>
            <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-strong:text-slate-900">
              <ReactMarkdown>{item.report}</ReactMarkdown>
            </div>
          </article>
        ) : null}
      </div>
    );
  }

  if (item.type === "designbuilder_report") {
    return (
      <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Konum" value={item.location ?? "-"} />
          <Metric label="Toplam Enerji" value={numberFmt(item.totalEnergyConsumption)} />
          <Metric label="Durum" value={item.summary.status} />
        </div>
        <div className="space-y-3">
          {item.sections.map((section) => (
            <article key={section.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-900">
                  {section.order}. {section.title}
                </p>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600">{section.status}</span>
              </div>
              {section.content ? (
                <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-strong:text-slate-900">
                  <ReactMarkdown>{section.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Bu bolum henuz tamamlanmamis.</p>
              )}
            </article>
          ))}
        </div>
      </div>
    );
  }

  const payload = asComparisonPayload(item.payload);

  return (
    <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
      {payload.strategistSummary ? (
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800">Stratejist Ozeti</p>
          <div className="prose prose-slate max-w-none prose-strong:text-amber-900">
            <ReactMarkdown>{payload.strategistSummary}</ReactMarkdown>
          </div>
        </article>
      ) : null}

      {Array.isArray(payload.scenarios) && payload.scenarios.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {payload.scenarios.map((scenario) => (
            <Metric
              key={scenario.scenarioId}
              label={scenario.scenarioName}
              value={`Skor ${numberFmt(scenario.finalScore)} · Enerji ${numberFmt(scenario.annualEnergyKwh)} kWh`}
            />
          ))}
        </div>
      ) : null}

      {Array.isArray(payload.sectionWinners) && payload.sectionWinners.length > 0 ? (
        <div className="space-y-3">
          {payload.sectionWinners.map((winner) => (
            <article key={`${winner.sectionTitle}-${winner.winnerScenarioName}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-900">{winner.sectionTitle}</p>
              <p className="mt-1 text-sm font-semibold text-emerald-700">{winner.winnerScenarioName}</p>
              <p className="mt-2 text-sm text-slate-600">{winner.reason}</p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
