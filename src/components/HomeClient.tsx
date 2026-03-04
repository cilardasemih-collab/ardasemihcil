"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

type AnalysisJob = {
  id: string;
  file_name: string;
  file_path: string;
  status: "uploaded" | "processing" | "report_ready" | "failed";
  report_text: string | null;
  error_text: string | null;
  created_at: string;
};

type PreviewRow = {
  row_index: number;
  payload: Record<string, unknown>;
};

const humanizeStatus = (status: AnalysisJob["status"]) => {
  if (status === "uploaded") return "Yüklendi";
  if (status === "processing") return "İşleniyor";
  if (status === "report_ready") return "Rapor Hazır";
  return "Hata";
};

const statusColor = (status: AnalysisJob["status"]) => {
  if (status === "uploaded") return "#1d4ed8";
  if (status === "processing") return "#d97706";
  if (status === "report_ready") return "#059669";
  return "#b91c1c";
};

const asNumber = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export default function HomeClient() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

  const refreshJobs = useCallback(async () => {
    const response = await fetch("/api/analysis/jobs", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      jobs?: AnalysisJob[];
    };

    if (!payload.success) {
      setMessage(payload.error ?? "İş listesi alınamadı.");
      return;
    }

    const list = payload.jobs ?? [];
    setJobs(list);

    if (!selectedJobId && list.length > 0) {
      setSelectedJobId(list[0].id);
    }
  }, [selectedJobId]);

  const refreshPreview = useCallback(async () => {
    if (!selectedJobId) {
      setPreviewRows([]);
      return;
    }

    const response = await fetch(`/api/analysis/preview?jobId=${encodeURIComponent(selectedJobId)}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      rows?: PreviewRow[];
    };

    if (!payload.success) {
      setMessage(payload.error ?? "Önizleme alınamadı.");
      return;
    }

    setPreviewRows(payload.rows ?? []);
  }, [selectedJobId]);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshJobs();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [refreshJobs]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  const uploadAndStart = async () => {
    if (!selectedFile) {
      setMessage("Önce .xlsx veya .csv dosyası seç.");
      return;
    }

    setBusy(true);
    setMessage("");

    const formData = new FormData();
    formData.append("file", selectedFile);

    const startResponse = await fetch("/api/analysis/start", {
      method: "POST",
      body: formData,
    });

    const startPayload = (await startResponse.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      job?: { id: string };
    };

    if (!startPayload.success || !startPayload.job?.id) {
      setBusy(false);
      setMessage(startPayload.error ?? "Job başlatılamadı.");
      return;
    }

    await fetch("/api/analysis/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: startPayload.job.id }),
    });

    setSelectedFile(null);
    setBusy(false);
    setSelectedJobId(startPayload.job.id);
    setMessage("Dosya yüklendi, analiz ve rapor üretimi başlatıldı.");
    await refreshJobs();
  };

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? null, [jobs, selectedJobId]);

  const chartModel = useMemo(() => {
    if (!previewRows.length) {
      return {
        lineData: [] as Array<{ index: number; value: number }>,
        barData: [] as Array<{ key: string; avg: number }>,
        detectedColumn: "",
      };
    }

    const samplePayload = previewRows[0]?.payload ?? {};
    const columns = Object.keys(samplePayload);

    let targetColumn = "";
    for (const column of columns) {
      const numericCount = previewRows
        .slice(0, 60)
        .map((row) => asNumber(row.payload[column]))
        .filter((value) => value !== null).length;
      if (numericCount >= 8) {
        targetColumn = column;
        break;
      }
    }

    if (!targetColumn) {
      return {
        lineData: [] as Array<{ index: number; value: number }>,
        barData: [] as Array<{ key: string; avg: number }>,
        detectedColumn: "",
      };
    }

    const lineData = previewRows
      .map((row) => ({
        index: row.row_index,
        value: asNumber(row.payload[targetColumn]),
      }))
      .filter((row) => row.value !== null) as Array<{ index: number; value: number }>;

    const chunkSize = Math.max(1, Math.floor(lineData.length / 8));
    const barData: Array<{ key: string; avg: number }> = [];
    for (let i = 0; i < lineData.length; i += chunkSize) {
      const chunk = lineData.slice(i, i + chunkSize);
      const avg = chunk.reduce((acc, cur) => acc + cur.value, 0) / chunk.length;
      barData.push({ key: `${i + 1}-${i + chunk.length}`, avg: Number(avg.toFixed(2)) });
    }

    return {
      lineData,
      barData,
      detectedColumn: targetColumn,
    };
  }, [previewRows]);

  return (
    <div className="container grid" style={{ gap: 16 }}>
      <section className="card grid" style={{ gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: "clamp(20px, 4vw, 30px)" }}>ardasemihcil · Verimlilik Dashboard</h1>
          <span style={{ fontSize: 13, color: "#374151" }}>Girişsiz kullanım aktif</span>
        </div>
        <p style={{ margin: 0, color: "#4b5563" }}>
          Excel/CSV dosyanı yükle, sistem veriyi işler, Google AI ile rapor üretir ve grafiklere dönüştürür.
        </p>
      </section>

      <section className="card grid" style={{ gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Dosya Yükle</h2>
        <input
          className="input"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
        />
        <button className="btn" disabled={busy} onClick={() => void uploadAndStart()}>
          {busy ? "İşleniyor..." : "Analiz Et"}
        </button>
      </section>

      <section className="card grid" style={{ gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Analiz İşleri</h2>
        {jobs.length === 0 ? (
          <p style={{ margin: 0 }}>Henüz analiz işi yok.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => setSelectedJobId(job.id)}
                style={{
                  textAlign: "left",
                  border: selectedJobId === job.id ? "2px solid #1d4ed8" : "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 10,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <p style={{ margin: 0, fontWeight: 600, overflowWrap: "anywhere" }}>{job.file_name}</p>
                <p style={{ margin: "6px 0", fontSize: 13, color: statusColor(job.status) }}>
                  {humanizeStatus(job.status)} · {new Date(job.created_at).toLocaleString("tr-TR")}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card grid" style={{ gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Görselleştirme</h2>
        {!selectedJob ? (
          <p style={{ margin: 0 }}>Grafik için bir iş seç.</p>
        ) : chartModel.lineData.length === 0 ? (
          <p style={{ margin: 0 }}>
            Sayısal sütun tespit edilemedi veya veri henüz işlenmedi. Durum: {humanizeStatus(selectedJob.status)}
          </p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13, color: "#4b5563" }}>
              Tespit edilen metrik sütunu: <strong>{chartModel.detectedColumn}</strong>
            </p>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={chartModel.lineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="index" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={chartModel.barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="key" hide />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="avg" fill="#059669" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      <section className="card grid" style={{ gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>AI Rapor</h2>
        {selectedJob?.report_text ? (
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{selectedJob.report_text}</div>
        ) : (
          <p style={{ margin: 0 }}>
            {selectedJob ? `Rapor henüz hazır değil. Durum: ${humanizeStatus(selectedJob.status)}` : "Henüz iş seçilmedi."}
          </p>
        )}
        {selectedJob?.error_text ? <p style={{ margin: 0, color: "#b91c1c" }}>Hata: {selectedJob.error_text}</p> : null}
      </section>

      {message ? <p style={{ margin: 0 }}>{message}</p> : null}
    </div>
  );
}
