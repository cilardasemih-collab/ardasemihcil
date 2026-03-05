"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
  const [chartHostWidth, setChartHostWidth] = useState(0);

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

  useEffect(() => {
    const updateWidth = () => {
      const host = document.getElementById("chart-host");
      if (!host) return;
      const next = Math.floor(host.getBoundingClientRect().width);
      if (next > 0) setChartHostWidth(next);
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

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
    <div className="container app-shell">
      <section className="hero card">
        <div>
          <h1 className="hero-title">ardasemihcil</h1>
          <p className="hero-subtitle">Fabrika Verimlilik Analiz Dashboard</p>
          <p className="hero-desc">Excel/CSV dosyanı yükle, sistem veriyi işler, Google AI ile rapor üretir ve metrikleri grafiklere dönüştürür.</p>
        </div>
        <div className="hero-badge">No-Login Mode</div>
      </section>

      <section className="main-grid">
        <div className="left-stack">
          <section className="card panel">
            <div className="panel-head">
              <h2>Dosya Yükle</h2>
            </div>
            <input
              className="input"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
            <button className="btn" disabled={busy} onClick={() => void uploadAndStart()}>
              {busy ? "İşleniyor..." : "Analiz Et"}
            </button>
            {message ? <p className="panel-note">{message}</p> : null}
          </section>

          <section className="card panel">
            <div className="panel-head">
              <h2>Görselleştirme</h2>
              {chartModel.detectedColumn ? <span className="chip">Metrik: {chartModel.detectedColumn}</span> : null}
            </div>

            {!selectedJob ? (
              <p className="panel-note">Grafik için bir iş seç.</p>
            ) : chartModel.lineData.length === 0 ? (
              <p className="panel-note">Sayısal sütun tespit edilemedi veya veri henüz işlenmedi. Durum: {humanizeStatus(selectedJob.status)}</p>
            ) : (
              <>
                <div id="chart-host" className="chart-wrap" style={{ height: 280 }}>
                  {chartHostWidth > 0 ? (
                    <LineChart width={Math.max(260, chartHostWidth - 18)} height={260} data={chartModel.lineData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="index" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  ) : (
                    <p className="panel-note">Grafik hazırlanıyor...</p>
                  )}
                </div>
                <div className="chart-wrap" style={{ height: 250 }}>
                  {chartHostWidth > 0 ? (
                    <BarChart width={Math.max(260, chartHostWidth - 18)} height={230} data={chartModel.barData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="key" hide />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="avg" fill="#059669" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  ) : (
                    <p className="panel-note">Grafik hazırlanıyor...</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        <div className="right-stack">
          <section className="card panel">
            <div className="panel-head">
              <h2>Analiz İşleri</h2>
              <span className="chip">{jobs.length} kayıt</span>
            </div>
            {jobs.length === 0 ? (
              <p className="panel-note">Henüz analiz işi yok.</p>
            ) : (
              <div className="job-list">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    className={`job-item ${selectedJobId === job.id ? "active" : ""}`}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <p className="job-title">{job.file_name}</p>
                    <p className="job-meta" style={{ color: statusColor(job.status) }}>
                      {humanizeStatus(job.status)} · {new Date(job.created_at).toLocaleString("tr-TR")}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="card panel">
            <div className="panel-head">
              <h2>AI Rapor</h2>
              {selectedJob ? <span className="chip">{humanizeStatus(selectedJob.status)}</span> : null}
            </div>
            {selectedJob?.report_text ? (
              <div className="report-block">{selectedJob.report_text}</div>
            ) : (
              <p className="panel-note">{selectedJob ? `Rapor henüz hazır değil. Durum: ${humanizeStatus(selectedJob.status)}` : "Henüz iş seçilmedi."}</p>
            )}
            {selectedJob?.error_text ? <p className="panel-error">Hata: {selectedJob.error_text}</p> : null}
          </section>
        </div>
      </section>
    </div>
  );
}
