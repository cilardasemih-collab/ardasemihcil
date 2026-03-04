import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServiceClient } from "@/lib/supabase/server";

type ProcessBody = {
  jobId?: string;
};

type JobRow = {
  id: string;
  user_id: string | null;
  file_name: string;
  file_path: string;
  status: "uploaded" | "processing" | "report_ready" | "failed";
};

type ColumnProfile = {
  name: string;
  kind: "numeric" | "date" | "text" | "mixed";
  nonNullCount: number;
  uniqueApprox: number;
  sampleValues: string[];
};

type NumericColumnSummary = {
  name: string;
  count: number;
  mean: number;
  min: number;
  max: number;
  stdev: number;
  trendSlope: number;
  cv: number;
};

type StageOneTableMeaning = {
  tableNameTr: string;
  tablePurposeTr: string;
  likelyDomainTr: string;
  kpiCandidates: string[];
  suggestedCharts: string[];
};

const toJsonRows = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [] as Record<string, unknown>[];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });
  return rows;
};

const inferColumnProfiles = (rows: Record<string, unknown>[]) => {
  const sample = rows.slice(0, 200);
  const keys = new Set<string>();
  sample.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)));

  const profiles: ColumnProfile[] = [];

  Array.from(keys).forEach((key) => {
    let numericCount = 0;
    let dateLikeCount = 0;
    let nonNullCount = 0;
    const uniques = new Set<string>();
    const samples: string[] = [];

    sample.forEach((row) => {
      const value = row[key];
      if (value === null || value === undefined || String(value).trim() === "") return;
      nonNullCount += 1;

      const text = String(value).trim();
      uniques.add(text);
      if (samples.length < 4) samples.push(text);

      const numeric = Number(text.replace(",", "."));
      if (Number.isFinite(numeric)) numericCount += 1;

      const asDate = Date.parse(text);
      if (Number.isFinite(asDate) && text.length >= 6) dateLikeCount += 1;
    });

    let kind: ColumnProfile["kind"] = "mixed";
    if (nonNullCount > 0) {
      const numericRatio = numericCount / nonNullCount;
      const dateRatio = dateLikeCount / nonNullCount;
      if (numericRatio >= 0.85) kind = "numeric";
      else if (dateRatio >= 0.75) kind = "date";
      else if (numericRatio <= 0.15 && dateRatio <= 0.15) kind = "text";
    }

    profiles.push({
      name: key,
      kind,
      nonNullCount,
      uniqueApprox: uniques.size,
      sampleValues: samples,
    });
  });

  return profiles;
};

const extractNumericSeries = (rows: Record<string, unknown>[], column: string) => {
  const values: number[] = [];
  rows.forEach((row) => {
    const raw = row[column];
    if (raw === null || raw === undefined) return;
    const parsed = Number(String(raw).trim().replace(",", "."));
    if (Number.isFinite(parsed)) values.push(parsed);
  });
  return values;
};

const summarizeNumericColumns = (rows: Record<string, unknown>[], profiles: ColumnProfile[]) => {
  const numericColumns = profiles.filter((profile) => profile.kind === "numeric").map((profile) => profile.name);

  const summary: NumericColumnSummary[] = numericColumns
    .map((name) => {
      const values = extractNumericSeries(rows, name);
      if (values.length < 3) return null;

      const count = values.length;
      const mean = values.reduce((acc, cur) => acc + cur, 0) / count;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const variance = values.reduce((acc, cur) => acc + (cur - mean) ** 2, 0) / count;
      const stdev = Math.sqrt(variance);
      const cv = mean === 0 ? 0 : stdev / Math.abs(mean);

      const n = count;
      const xMean = (n - 1) / 2;
      const yMean = mean;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i += 1) {
        const dx = i - xMean;
        const dy = values[i] - yMean;
        num += dx * dy;
        den += dx * dx;
      }
      const trendSlope = den === 0 ? 0 : num / den;

      return {
        name,
        count,
        mean: Number(mean.toFixed(4)),
        min: Number(min.toFixed(4)),
        max: Number(max.toFixed(4)),
        stdev: Number(stdev.toFixed(4)),
        trendSlope: Number(trendSlope.toFixed(6)),
        cv: Number(cv.toFixed(6)),
      } satisfies NumericColumnSummary;
    })
    .filter((item): item is NumericColumnSummary => Boolean(item));

  return summary;
};

const buildSystemProductivityReport = (
  fileName: string,
  rowCount: number,
  stageOne: StageOneTableMeaning,
  profiles: ColumnProfile[],
  numericSummary: NumericColumnSummary[]
) => {
  const stable = numericSummary.filter((col) => col.cv > 0 && col.cv <= 0.25);
  const unstable = numericSummary.filter((col) => col.cv > 0.45);
  const rising = numericSummary.filter((col) => col.trendSlope > 0);
  const falling = numericSummary.filter((col) => col.trendSlope < 0);

  const topKpi = stageOne.kpiCandidates.slice(0, 6).join(", ") || "Belirlenemedi";
  const charts = stageOne.suggestedCharts.slice(0, 6).join(", ") || "Belirlenemedi";

  return [
    `Dosya: ${fileName}`,
    `Satır Sayısı: ${rowCount}`,
    `AI Tablo Tanımı: ${stageOne.tableNameTr} / ${stageOne.tablePurposeTr}`,
    `Alan: ${stageOne.likelyDomainTr}`,
    `Önerilen KPI'lar: ${topKpi}`,
    `Önerilen Grafikler: ${charts}`,
    "",
    "Sistemsel Verimlilik Yorumu:",
    `- Toplam profil çıkarılan sütun: ${profiles.length}`,
    `- Sayısal sütun: ${numericSummary.length}`,
    `- Stabil metrik sayısı (CV<=0.25): ${stable.length}`,
    `- Dalgalı metrik sayısı (CV>0.45): ${unstable.length}`,
    `- Artış trendinde metrik: ${rising.length}`,
    `- Düşüş trendinde metrik: ${falling.length}`,
    "",
    "Verimli Olabilecek Noktalar:",
    stable.length
      ? stable.slice(0, 8).map((col) => `- ${col.name}: CV=${col.cv}, ort=${col.mean}, trend=${col.trendSlope}`).join("\n")
      : "- Stabil metrik bulunamadı.",
    "",
    "Verimsiz veya Riskli Noktalar:",
    unstable.length
      ? unstable.slice(0, 8).map((col) => `- ${col.name}: CV=${col.cv}, min=${col.min}, max=${col.max}`).join("\n")
      : "- Aşırı dalgalı metrik bulunamadı.",
    "",
    "Detay Sayısal Özet:",
    JSON.stringify(numericSummary.slice(0, 30), null, 2),
  ].join("\n");
};

const summarizeRows = (rows: Record<string, unknown>[]) => {
  const totalRows = rows.length;
  const sampleRows = rows.slice(0, 25);

  const numericColumns = new Map<string, number[]>();
  sampleRows.forEach((row) => {
    Object.entries(row).forEach(([key, value]) => {
      const parsed = Number(String(value ?? "").replace(",", "."));
      if (!Number.isFinite(parsed)) return;
      if (!numericColumns.has(key)) numericColumns.set(key, []);
      numericColumns.get(key)!.push(parsed);
    });
  });

  const numericSummary = Array.from(numericColumns.entries()).map(([key, values]) => {
    const sum = values.reduce((acc, cur) => acc + cur, 0);
    const avg = values.length ? sum / values.length : 0;
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    return { key, avg, min, max, count: values.length };
  });

  return { totalRows, sampleRows, numericSummary };
};

const buildStageOnePrompt = (fileName: string, profiles: ColumnProfile[], totalRows: number) => {
  return [
    "Sen bir veri modelleme uzmanısın.",
    `Dosya adı: ${fileName}`,
    `Toplam satır: ${totalRows}`,
    "Aşağıda tablo sütun profilleri var.",
    JSON.stringify(profiles, null, 2),
    "",
    "Sadece geçerli JSON döndür. Şema:",
    '{"tableNameTr":"...","tablePurposeTr":"...","likelyDomainTr":"...","kpiCandidates":["..."],"suggestedCharts":["..."]}',
  ].join("\n");
};

const buildStageThreePrompt = (stageOne: StageOneTableMeaning, systemReport: string, summary: ReturnType<typeof summarizeRows>) => {
  return [
    "Sen kıdemli fabrika verimlilik danışmanısın.",
    "Aşağıdaki veriyi 2. kez değerlendir ve kapsamlı final rapor üret.",
    "",
    "AŞAMA-1 (Tablo Tanımı):",
    JSON.stringify(stageOne, null, 2),
    "",
    "AŞAMA-2 (Sistemsel ön rapor):",
    systemReport,
    "",
    "Ek örnek satırlar:",
    JSON.stringify(summary.sampleRows, null, 2),
    "",
    "Lütfen Türkçe, uzun ve detaylı bir rapor yaz. Format:",
    "1) Tablo ve iş süreci tanımı",
    "2) Verimli noktalar (uzun açıklama)",
    "3) Verimsiz/riskli noktalar (uzun açıklama)",
    "4) Kök neden analizi",
    "5) Optimizasyon önerileri (kısa, orta, uzun vadeli)",
    "6) Beklenen verimlilik etkisi ve KPI takip planı",
  ].join("\n");
};

const generateGeminiText = async (prompt: string) => {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return "GOOGLE_AI_API_KEY tanımlı olmadığı için otomatik özet üretildi: Veri yüklendi, satırlar işlendi. Lütfen Google AI anahtarını ekleyip tekrar çalıştır.";
  }

  const model = process.env.GOOGLE_AI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1200,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google AI hatası: ${text}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
  if (!text) throw new Error("Google AI boş cevap döndü.");
  return text;
};

const parseStageOneJson = (text: string): StageOneTableMeaning => {
  const fallback: StageOneTableMeaning = {
    tableNameTr: "Tanımlanamayan Tablo",
    tablePurposeTr: "Veri kaynağı amacı otomatik tespit edilemedi.",
    likelyDomainTr: "Üretim/Operasyon",
    kpiCandidates: ["Üretim Adedi", "Hata Oranı", "Duruş Süresi"],
    suggestedCharts: ["Zaman Serisi", "Bar", "Dağılım"],
  };

  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < 0 || end <= start) return fallback;
    const jsonLike = text.slice(start, end + 1);
    const parsed = JSON.parse(jsonLike) as Partial<StageOneTableMeaning>;
    return {
      tableNameTr: parsed.tableNameTr || fallback.tableNameTr,
      tablePurposeTr: parsed.tablePurposeTr || fallback.tablePurposeTr,
      likelyDomainTr: parsed.likelyDomainTr || fallback.likelyDomainTr,
      kpiCandidates: Array.isArray(parsed.kpiCandidates) ? parsed.kpiCandidates.map(String).slice(0, 12) : fallback.kpiCandidates,
      suggestedCharts: Array.isArray(parsed.suggestedCharts) ? parsed.suggestedCharts.map(String).slice(0, 12) : fallback.suggestedCharts,
    };
  } catch {
    return fallback;
  }
};

export async function POST(request: NextRequest) {
  let currentJobId = "";
  try {
    const body = (await request.json().catch(() => ({}))) as ProcessBody;
    const jobId = String(body.jobId ?? "").trim();
    currentJobId = jobId;
    if (!jobId) {
      return NextResponse.json({ success: false, error: "jobId eksik." }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();
    const { data: job, error: jobError } = await serviceSupabase
      .from("analysis_jobs")
      .select("id,user_id,file_name,file_path,status")
      .eq("id", jobId)
      .maybeSingle<JobRow>();

    if (jobError || !job) {
      return NextResponse.json({ success: false, error: "İş bulunamadı." }, { status: 404 });
    }

    if (job.status === "processing") {
      return NextResponse.json({ success: true, message: "İş zaten işleniyor." }, { status: 200 });
    }

    await serviceSupabase
      .from("analysis_jobs")
      .update({ status: "processing", error_text: null })
      .eq("id", job.id);

    const { data: fileData, error: fileError } = await serviceSupabase.storage
      .from("uploaded-excels")
      .download(job.file_path);

    if (fileError || !fileData) {
      await serviceSupabase
        .from("analysis_jobs")
        .update({ status: "failed", error_text: fileError?.message ?? "Dosya indirilemedi." })
        .eq("id", job.id);
      return NextResponse.json({ success: false, error: "Dosya indirilemedi." }, { status: 200 });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const rows = toJsonRows(buffer);

    if (rows.length === 0) {
      await serviceSupabase
        .from("analysis_jobs")
        .update({ status: "failed", error_text: "Dosya içinde işlenebilir satır bulunamadı." })
        .eq("id", job.id);
      return NextResponse.json({ success: false, error: "Satır bulunamadı." }, { status: 400 });
    }

    await serviceSupabase.from("processed_data").delete().eq("job_id", job.id);

    const rowPayload = rows.slice(0, 1000).map((payload, index) => ({
      job_id: job.id,
      row_index: index,
      payload,
    }));

    const { error: insertError } = await serviceSupabase.from("processed_data").insert(rowPayload);
    if (insertError) {
      await serviceSupabase
        .from("analysis_jobs")
        .update({ status: "failed", error_text: insertError.message })
        .eq("id", job.id);
      return NextResponse.json({ success: false, error: insertError.message }, { status: 200 });
    }

    const summary = summarizeRows(rows);
    const columnProfiles = inferColumnProfiles(rows);
    const numericSummary = summarizeNumericColumns(rows, columnProfiles);

    const stageOnePrompt = buildStageOnePrompt(job.file_name, columnProfiles, rows.length);
    const stageOneRaw = await generateGeminiText(stageOnePrompt);
    const stageOne = parseStageOneJson(stageOneRaw);

    const systemReport = buildSystemProductivityReport(
      job.file_name,
      rows.length,
      stageOne,
      columnProfiles,
      numericSummary
    );

    const stageThreePrompt = buildStageThreePrompt(stageOne, systemReport, summary);
    const finalAiReport = await generateGeminiText(stageThreePrompt);

    const reportText = [
      "AŞAMA 1 · AI TABLO TANIMI",
      JSON.stringify(stageOne, null, 2),
      "",
      "AŞAMA 2 · SİSTEM RAPORU",
      systemReport,
      "",
      "AŞAMA 3 · AI FİNAL RAPORU",
      finalAiReport,
    ].join("\n\n");

    const { error: updateError } = await serviceSupabase
      .from("analysis_jobs")
      .update({ status: "report_ready", report_text: reportText, error_text: null })
      .eq("id", job.id);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 200 });
    }

    return NextResponse.json({ success: true, jobId: job.id, processedRows: rowPayload.length }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (currentJobId) {
      try {
        const serviceSupabase = createServiceClient();
        await serviceSupabase
          .from("analysis_jobs")
          .update({ status: "failed", error_text: message })
          .eq("id", currentJobId);
      } catch {
      }
    }
    return NextResponse.json({ success: false, error: message }, { status: 200 });
  }
}
