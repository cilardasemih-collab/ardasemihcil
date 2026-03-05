"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import ReactMarkdown from "react-markdown";

import EnergyChart from "@/components/EnergyChart";
import { supabaseClient } from "@/lib/supabaseClient";

type UploadState = "idle" | "uploading" | "success" | "error";

type OptimizationSummary = {
  rowCount: number;
  oldTotalEnergy: number;
  newTotalEnergy: number;
  energySaved: number;
  optimizationMethod: string;
};

const RAW_FILES_BUCKET = "raw-files";

const isCsvFile = (file: File): boolean => {
  const nameCheck = file.name.toLowerCase().endsWith(".csv");
  const typeCheck = file.type === "text/csv" || file.type === "application/vnd.ms-excel";
  return nameCheck || typeCheck;
};

export default function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [summary, setSummary] = useState<OptimizationSummary | null>(null);
  const [report, setReport] = useState<string>("");
  const [actionPlan, setActionPlan] = useState<string[]>([]);
  const [analysisResultId, setAnalysisResultId] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isUploading = uploadState === "uploading";
  const isBusy = isUploading || isAnalyzing;

  const statusStyles = useMemo(() => {
    if (uploadState === "success") {
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    }
    if (uploadState === "error") {
      return "border-rose-300 bg-rose-50 text-rose-700";
    }
    return "border-slate-200 bg-white text-slate-600";
  }, [uploadState]);

  const handleUpload = async (file: File): Promise<void> => {
    if (!isCsvFile(file)) {
      setUploadState("error");
      setMessage("Sadece .csv dosyasi yukleyebilirsin.");
      return;
    }

    setSummary(null);
    setReport("");
    setActionPlan([]);
    setAnalysisResultId("");

    setUploadState("uploading");
    setProgress(12);
    setMessage("Dosya Supabase Storage'a yukleniyor...");
    let didSucceed = false;

    const progressTimer = window.setInterval(() => {
      setProgress((prev) => (prev >= 90 ? prev : prev + 8));
    }, 180);

    try {
      const extension = file.name.split(".").pop() ?? "csv";
      const filePath = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;

      const { data, error } = await supabaseClient.storage.from(RAW_FILES_BUCKET).upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: "text/csv",
      });

      if (error) {
        throw new Error(error.message);
      }

      setProgress(100);
      setUploadState("success");
      setMessage("Yukleme basarili. Dosya analiz adimina hazir.");
      didSucceed = true;

      if (!data?.path) {
        throw new Error("Yuklenen dosya yolu alinamadi.");
      }

      setIsAnalyzing(true);
      setMessage("Yapay Zeka Veriyi Analiz Ediyor...");

      const analyzeResponse = await fetch("/api/analyze-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: data.path, fileName: file.name }),
      });

      const analyzePayload = (await analyzeResponse.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        summary?: OptimizationSummary;
        report?: string;
        actionPlan?: string[];
        analysisResultId?: string | null;
        saveMessage?: string | null;
      };

      if (!analyzeResponse.ok || !analyzePayload.success) {
        throw new Error(analyzePayload.error ?? "AI analiz endpoint hatasi.");
      }

      console.log("[Optimization Summary]", analyzePayload.summary);
      setSummary(analyzePayload.summary ?? null);
      setReport(analyzePayload.report ?? "");
      setActionPlan(Array.isArray(analyzePayload.actionPlan) ? analyzePayload.actionPlan : []);
      setAnalysisResultId(analyzePayload.analysisResultId ?? "");

      if (analyzePayload.saveMessage) {
        setMessage(analyzePayload.saveMessage);
      } else {
        setMessage("Yukleme, analiz ve kayit islemi tamamlandi.");
      }

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Beklenmeyen bir hata olustu.";
      setUploadState("error");
      setMessage(`Yukleme hatasi: ${errorMessage}`);
    } finally {
      window.clearInterval(progressTimer);
      setIsAnalyzing(false);
      if (!didSucceed) {
        setProgress(0);
      }
    }
  };

  const onInputChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleUpload(file);
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleUpload(file);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (): void => {
    setIsDragging(false);
  };

  return (
    <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-glow backdrop-blur">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-slate-900">CSV Yukleme Modulu</h2>
        <p className="mt-2 text-sm text-slate-600">
          Dosyani birak veya sec. Sistem dosyayi ham veriden analiz surecine tasiyacak.
        </p>
      </div>

      <div
        onDrop={(event) => void onDrop(event)}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
          isDragging ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-slate-50"
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => void onInputChange(event)}
          disabled={isBusy}
        />

        <UploadCloud className="mx-auto h-10 w-10 text-slate-700" />
        <p className="mt-3 text-sm font-medium text-slate-700">.csv dosyasini buraya birak</p>
        <p className="mt-1 text-xs text-slate-500">veya dosya secmek icin tikla</p>
      </div>

      <div className="mt-5 space-y-3">
        {isUploading ? (
          <div className="flex items-center gap-2 text-sm text-teal-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Yukleme devam ediyor...</span>
          </div>
        ) : null}

        {isAnalyzing ? (
          <div className="flex items-center gap-2 text-sm text-cyan-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Yapay Zeka Veriyi Analiz Ediyor...</span>
          </div>
        ) : null}

        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {uploadState === "success" ? (
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            <span>Dosya basariyla yuklendi.</span>
          </div>
        ) : null}

        {message ? <p className={`rounded-lg border px-3 py-2 text-sm ${statusStyles}`}>{message}</p> : null}

        {summary ? (
          <div className="space-y-3 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Optimizasyon Ozeti - {summary.rowCount} satir
            </p>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">Eski Tuketim</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{summary.oldTotalEnergy.toLocaleString("tr-TR")}</p>
                </article>

                <article className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                  <p className="text-xs font-medium text-cyan-700">Yeni Tuketim</p>
                  <p className="mt-1 text-lg font-bold text-cyan-900">{summary.newTotalEnergy.toLocaleString("tr-TR")}</p>
                </article>

                <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-medium text-emerald-700">Tasarruf Edilen Enerji</p>
                  <p className="mt-1 text-lg font-bold text-emerald-900">{summary.energySaved.toLocaleString("tr-TR")}</p>
                </article>
              </div>

              <EnergyChart oldTotalEnergy={summary.oldTotalEnergy} newTotalEnergy={summary.newTotalEnergy} />
            </div>

            <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              Yontem: {summary.optimizationMethod}
            </p>

            {report ? (
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Nihai Muhendislik Raporu</p>
                <div className="prose prose-slate max-w-none prose-headings:font-extrabold prose-h1:text-slate-900 prose-h2:text-slate-900 prose-strong:text-slate-900 prose-li:my-1">
                  <ReactMarkdown>{report}</ReactMarkdown>
                </div>
              </article>
            ) : null}

            {actionPlan.length > 0 ? (
              <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
                <p className="mb-2 text-sm font-bold text-sky-800">AI Danismaninin Ekstra OEE Tavsiyeleri</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-sky-900">
                  {actionPlan.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </article>
            ) : null}

            {analysisResultId ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                Kayit ID: {analysisResultId}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
