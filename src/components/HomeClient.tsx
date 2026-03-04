"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AnalysisJob = {
  id: string;
  file_name: string;
  file_path: string;
  status: "uploaded" | "processing" | "report_ready" | "failed";
  report_text: string | null;
  error_text: string | null;
  created_at: string;
};

const humanizeStatus = (status: AnalysisJob["status"]) => {
  if (status === "uploaded") return "Yüklendi";
  if (status === "processing") return "İşleniyor";
  if (status === "report_ready") return "Rapor Hazır";
  return "Hata";
};

export default function HomeClient() {
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [signedIn, setSignedIn] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);

  const refreshJobs = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setSignedIn(false);
      setJobs([]);
      return;
    }

    setSignedIn(true);
    const { data, error } = await supabase
      .from("analysis_jobs")
      .select("id,file_name,file_path,status,report_text,error_text,created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      setMessage(error.message);
      return;
    }

    setJobs((data ?? []) as AnalysisJob[]);
  }, [supabase]);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    if (!signedIn) return;
    const interval = window.setInterval(() => {
      void refreshJobs();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [signedIn, refreshJobs]);

  const signIn = async () => {
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      return;
    }
    setPassword("");
    setMessage("Giriş başarılı.");
    await refreshJobs();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSignedIn(false);
    setJobs([]);
    setMessage("Çıkış yapıldı.");
  };

  const uploadAndStart = async () => {
    if (!selectedFile) {
      setMessage("Önce .xlsx veya .csv dosyası seç.");
      return;
    }

    setBusy(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setBusy(false);
      setMessage("Devam etmek için giriş yap.");
      return;
    }

    const safeName = selectedFile.name.replace(/\s+/g, "-");
    const path = `${user.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("uploaded-excels")
      .upload(path, selectedFile, { upsert: false });

    if (uploadError) {
      setBusy(false);
      setMessage(uploadError.message);
      return;
    }

    const response = await fetch("/api/analysis/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: selectedFile.name,
        filePath: path,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      job?: { id: string };
    };

    if (!payload.success) {
      setBusy(false);
      setMessage(payload.error ?? "Job başlatılamadı.");
      return;
    }

    if (payload.job?.id) {
      await fetch("/api/analysis/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: payload.job.id }),
      });
    }

    setSelectedFile(null);
    setBusy(false);
    setMessage("Dosya yüklendi, işleme ve Google AI rapor üretimi başlatıldı.");
    await refreshJobs();
  };

  return (
    <div className="container grid" style={{ gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: "clamp(20px, 4vw, 30px)" }}>ardasemihcil · Fabrika Verimlilik Analiz Platformu</h1>

      <section className="card grid">
        <h2 style={{ margin: 0, fontSize: 18 }}>1) Kimlik Doğrulama</h2>
        {!signedIn ? (
          <>
            <input
              className="input"
              placeholder="E-posta"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              className="input"
              placeholder="Şifre"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button className="btn" onClick={() => void signIn()}>
              Giriş Yap
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => void signOut()} style={{ width: "fit-content" }}>
            Çıkış Yap
          </button>
        )}
      </section>

      <section className="card grid">
        <h2 style={{ margin: 0, fontSize: 18 }}>2) Excel/CSV Yükle ve Analizi Başlat</h2>
        <input
          className="input"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
        />
        <button className="btn" disabled={busy || !signedIn} onClick={() => void uploadAndStart()}>
          {busy ? "İşleniyor..." : "Analiz Et"}
        </button>
      </section>

      <section className="card grid">
        <h2 style={{ margin: 0, fontSize: 18 }}>3) Son İşler</h2>
        {jobs.length === 0 ? (
          <p style={{ margin: 0 }}>Henüz analiz işi yok.</p>
        ) : (
          jobs.map((job) => (
            <div key={job.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, overflowWrap: "anywhere" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{job.file_name}</p>
              <p style={{ margin: "6px 0", fontSize: 13 }}>
                Durum: {humanizeStatus(job.status)} · {new Date(job.created_at).toLocaleString("tr-TR")}
              </p>
              {job.report_text ? <p style={{ margin: "6px 0 0" }}>Rapor: {job.report_text}</p> : null}
              {job.error_text ? <p style={{ margin: "6px 0 0", color: "#b91c1c" }}>Hata: {job.error_text}</p> : null}
            </div>
          ))
        )}
      </section>

      {message ? <p style={{ margin: 0 }}>{message}</p> : null}
    </div>
  );
}
