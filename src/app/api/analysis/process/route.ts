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

const buildPrompt = (fileName: string, summary: ReturnType<typeof summarizeRows>) => {
  return [
    "Sen kıdemli bir fabrika verimlilik analisti gibi davran.",
    `Dosya adı: ${fileName}`,
    `Toplam satır: ${summary.totalRows}`,
    "",
    "Özet sayısal sütun istatistikleri:",
    JSON.stringify(summary.numericSummary, null, 2),
    "",
    "Örnek kayıtlar:",
    JSON.stringify(summary.sampleRows, null, 2),
    "",
    "Lütfen Türkçe ve kısa başlıklar ile şu formatta yanıt ver:",
    "1) Üretim/operasyon trend özeti",
    "2) Verimsizlik veya anomali tespiti",
    "3) Hızlı kazanım önerileri (3-5 madde)",
    "4) Ölçülmesi gereken KPI listesi",
  ].join("\n");
};

const generateGeminiReport = async (prompt: string) => {
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
    const prompt = buildPrompt(job.file_name, summary);
    const reportText = await generateGeminiReport(prompt);

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
