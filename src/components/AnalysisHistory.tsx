"use client";

import { useEffect, useState } from "react";

import { supabaseClient } from "@/lib/supabaseClient";

type AnalysisHistoryItem = {
  id: string;
  file_name: string;
  created_at: string;
  savings_amount: number;
};

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export default function AnalysisHistory() {
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const { data, error } = await supabaseClient
          .from("analysis_results")
          .select("id,file_name,created_at,savings_amount")
          .order("created_at", { ascending: false })
          .limit(5);

        if (error) {
          throw new Error(error.message);
        }

        const normalized = (data ?? []).map((row) => ({
          id: String(row.id),
          file_name: String(row.file_name ?? "Isimsiz dosya"),
          created_at: String(row.created_at ?? ""),
          savings_amount: Number(row.savings_amount ?? 0),
        }));

        setItems(normalized);
      } catch {
        setErrorMessage("Gecmis analizler su an yuklenemiyor. Lutfen birazdan tekrar deneyin.");
      } finally {
        setLoading(false);
      }
    };

    void loadHistory();
  }, []);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-glow backdrop-blur">
      <header className="mb-4">
        <h2 className="text-xl font-bold text-slate-900">Son 5 Analiz</h2>
        <p className="mt-1 text-sm text-slate-600">Kaydedilen en guncel analiz sonuclarini buradan takip edebilirsin.</p>
      </header>

      {loading ? <p className="text-sm text-slate-600">Gecmis analizler yukleniyor...</p> : null}

      {!loading && errorMessage ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{errorMessage}</p>
      ) : null}

      {!loading && !errorMessage && items.length === 0 ? (
        <p className="text-sm text-slate-600">Henuz kaydedilmis analiz bulunmuyor.</p>
      ) : null}

      {!loading && !errorMessage && items.length > 0 ? (
        <div className="grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{item.file_name}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDate(item.created_at)}</p>
              <p className="mt-2 text-sm font-bold text-emerald-700">
                Kazanilan Tasarruf Miktari: {item.savings_amount.toLocaleString("tr-TR")}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
