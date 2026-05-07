import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { generateOeeActionPlan } from "@/lib/ai/generateActionPlan";
import { generateAdvancedInsights } from "@/lib/ai/generateAdvancedInsights";
import { generateEngineeringReport } from "@/lib/ai/generateEngineeringReport";
import { generateGeminiText } from "@/lib/ai/geminiClient";
import { generatePracticeProblems } from "@/lib/ai/generatePracticeProblems";
import {
  buildOeeSummary,
  buildColumnContributions,
  buildOptimizationSummary,
  detectTopAnomalies,
  parseFullCsvContent,
  type AiDiagnosis,
  type ParsedCsvData,
} from "@/utils/processData";

export const runtime = "nodejs";
export const maxDuration = 60;

type AnalyzeCsvBody = {
  filePath?: string;
  fileName?: string;
};

type CsvPreview = {
  headers: string[];
  firstFiveRows: Array<Record<string, string>>;
};

type CsvPreviewPayload = {
  headers: string[];
  rows: Array<Record<string, string>>;
  numericSummary: Array<{
    column: string;
    avg: number;
    min: number;
    max: number;
  }>;
};

const RAW_FILES_BUCKET = "raw-files";
const MAX_DOWNLOAD_SIZE_BYTES = 25 * 1024 * 1024;

const buildSystemPrompt = () => {
  return [
    "Sen uzman bir endustriyel enerji verimliligi muhendisisin.",
    "Sana bir makine/fabrika veri setinin (CSV) ilk 5 satirini veriyorum.",
    "Lutfen bu veriye bakarak uygulanmasi gereken matematiksel optimizasyon formulunu ve hedeflenmesi gereken sutunlari tespit et.",
    "Yanitin SADECE su formatta bir JSON olmalidir:",
    "{ \"tespit\": \"sorunun kisa tanimi\", \"hedef_kolonlar\": [\"kolon1\", \"kolon2\"], \"matematiksel_islem_talimati\": \"sistemin kod tarafinda yapmasi gereken matematiksel islemin algoritmasi\" }",
  ].join(" ");
};

const buildPreviewFromFullRows = (parsedCsv: ParsedCsvData): CsvPreview => {
  const firstFiveRows = parsedCsv.rows.slice(0, 5).map((row) => {
    const normalized: Record<string, string> = {};
    parsedCsv.headers.forEach((header) => {
      normalized[header] = row[header] ?? "";
    });
    return normalized;
  });

  return {
    headers: parsedCsv.headers,
    firstFiveRows,
  };
};

const buildCsvPreviewPayload = (parsedCsv: ParsedCsvData): CsvPreviewPayload => {
  const limitedHeaders = parsedCsv.headers.slice(0, 12);
  const rows = parsedCsv.rows.slice(0, 8).map((row) => {
    const normalized: Record<string, string> = {};
    limitedHeaders.forEach((header) => {
      normalized[header] = row[header] ?? "";
    });
    return normalized;
  });

  const numericSummary = limitedHeaders
    .map((header) => {
      const values = parsedCsv.rows
        .map((row) => Number.parseFloat(String(row[header] ?? "").replace(",", ".")))
        .filter((value) => Number.isFinite(value));

      if (values.length < 2) return null;

      const total = values.reduce((sum, value) => sum + value, 0);
      const min = Math.min(...values);
      const max = Math.max(...values);

      return {
        column: header,
        avg: Number((total / values.length).toFixed(3)),
        min: Number(min.toFixed(3)),
        max: Number(max.toFixed(3)),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 6);

  return {
    headers: limitedHeaders,
    rows,
    numericSummary,
  };
};

const parseJsonCandidate = (value: string): unknown => {
  return JSON.parse(value);
};

const sanitizeJsonText = (raw: string): string => {
  const withoutFence = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return withoutFence.slice(start, end + 1);
  }

  return withoutFence;
};

const parseDiagnosisJson = async (rawJson: string): Promise<AiDiagnosis> => {
  const candidates = [rawJson, sanitizeJsonText(rawJson)];

  for (const candidate of candidates) {
    try {
      const parsed = parseJsonCandidate(candidate) as Partial<AiDiagnosis>;
      if (
        parsed &&
        typeof parsed.tespit === "string" &&
        Array.isArray(parsed.hedef_kolonlar) &&
        typeof parsed.matematiksel_islem_talimati === "string"
      ) {
        return {
          tespit: parsed.tespit,
          hedef_kolonlar: parsed.hedef_kolonlar.map((item) => String(item)),
          matematiksel_islem_talimati: parsed.matematiksel_islem_talimati,
        };
      }
    } catch {
      // Continue to repair fallback.
    }
  }

  const { text: repairedJson } = await generateGeminiText({
    prompt: [
      "Asagidaki metni SADECE gecerli JSON'a cevir.",
      "Sema zorunlu:",
      '{ "tespit": "string", "hedef_kolonlar": ["string"], "matematiksel_islem_talimati": "string" }',
      "Ek aciklama yazma.",
      "METIN:",
      rawJson,
    ].join("\n"),
    responseMimeType: "application/json",
    temperature: 0,
    maxOutputTokens: 500,
    timeoutMs: 15000,
  });

  try {
    const repaired = parseJsonCandidate(sanitizeJsonText(repairedJson)) as Partial<AiDiagnosis>;
    if (
      repaired &&
      typeof repaired.tespit === "string" &&
      Array.isArray(repaired.hedef_kolonlar) &&
      typeof repaired.matematiksel_islem_talimati === "string"
    ) {
      return {
        tespit: repaired.tespit,
        hedef_kolonlar: repaired.hedef_kolonlar.map((item) => String(item)),
        matematiksel_islem_talimati: repaired.matematiksel_islem_talimati,
      };
    }
  } catch {
    // Throw below with unified error message.
  }

  throw new Error("AI JSON formatinda gecerli teshis yaniti donmedi.");
};

const callGeminiForDiagnosis = async (preview: CsvPreview): Promise<AiDiagnosis> => {
  const userPayload = {
    headers: preview.headers,
    first_five_rows: preview.firstFiveRows,
  };

  const { text: rawJson } = await generateGeminiText({
    prompt: `${buildSystemPrompt()}\n\nVERI OZETI:\n${JSON.stringify(userPayload, null, 2)}`,
    responseMimeType: "application/json",
    temperature: 0.1,
    maxOutputTokens: 700,
    timeoutMs: 30000,
  });

  if (!rawJson) {
    throw new Error("AI bos yanit dondu.");
  }

  return parseDiagnosisJson(rawJson);
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as AnalyzeCsvBody;
    const filePath = String(body.filePath ?? "").trim();
    const fallbackFileName = decodeURIComponent(filePath.split("/").pop() ?? "analysis.csv");
    const fileName = String(body.fileName ?? "").trim() || fallbackFileName;

    if (!filePath) {
      return NextResponse.json({ success: false, error: "filePath zorunludur." }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();
    const { data, error } = await serviceSupabase.storage.from(RAW_FILES_BUCKET).download(filePath);

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: error?.message ?? "Dosya Supabase Storage'dan okunamadi." },
        { status: 500 }
      );
    }

    if (data.size > MAX_DOWNLOAD_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "CSV dosyasi cok buyuk. Maksimum 25MB desteklenir." },
        { status: 413 }
      );
    }

    const csvContent = await data.text();
    const parsedCsv = parseFullCsvContent(csvContent);
    const preview = buildPreviewFromFullRows(parsedCsv);
    const csvPreview = buildCsvPreviewPayload(parsedCsv);
    const aiResult = await callGeminiForDiagnosis(preview);
    const summary = buildOptimizationSummary(parsedCsv, aiResult);
    const oeeSummary = buildOeeSummary(parsedCsv, summary);
    const contributionSummary = buildColumnContributions(parsedCsv, aiResult, 8);
    const anomalies = detectTopAnomalies(parsedCsv, 6);
    const report = await generateEngineeringReport(summary, { timeoutMs: 45000 });
    const actionPlan = await generateOeeActionPlan(
      { optimizationMethod: summary.optimizationMethod },
      { timeoutMs: 30000 }
    );
    let practiceProblems = "";
    let advancedInsights = "";
    try {
      practiceProblems = await generatePracticeProblems({
        summary,
        oeeSummary,
        diagnosis: aiResult,
        contributions: contributionSummary,
        anomalies,
        parsedCsv,
      });
    } catch {
      practiceProblems =
        "## Ornek Soru Uretimi\nBu calistirmada otomatik soru-cozum uretimi tamamlanamadi. Mevcut analiz raporlari gecerlidir.";
    }
    try {
      advancedInsights = await generateAdvancedInsights({
        summary,
        oeeSummary,
        contributions: contributionSummary,
        anomalies,
      });
    } catch {
      advancedInsights = "### Uzman Notu\nEk AI icgoru bu calistirmada uretilemedi. Mevcut rapor ve metrikler gecerlidir.";
    }

    let analysisResultId: string | null = null;
    let saveMessage: string | null = null;
    const analysisPayload = {
      summary,
      oeeSummary,
      contributionSummary,
      anomalies,
      report,
      actionPlan,
      practiceProblems,
      advancedInsights,
      csvPreview,
    };

    try {
      const { data: savedRow, error: saveError } = await serviceSupabase
        .from("analysis_results")
        .insert({
          file_name: fileName,
          optimization_method: summary.optimizationMethod,
          old_total_energy: summary.oldTotalEnergy,
          new_total_energy: summary.newTotalEnergy,
          savings_amount: summary.energySaved,
          ai_report_markdown: report,
          analysis_payload: analysisPayload,
        })
        .select("id")
        .single();

      if (saveError) {
        saveMessage = "Analiz tamamlandi ancak veritabani kaydi yapilamadi.";
      } else {
        analysisResultId = savedRow?.id ?? null;
      }
    } catch {
      saveMessage = "Analiz tamamlandi ancak kayit asamasinda beklenmeyen bir hata olustu.";
    }

    return NextResponse.json(
      {
        success: true,
        summary,
        oeeSummary,
        contributionSummary,
        anomalies,
        csvPreview,
        report,
        actionPlan,
        practiceProblems,
        advancedInsights,
        analysisResultId,
        saveMessage,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Beklenmeyen bir hata olustu.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
