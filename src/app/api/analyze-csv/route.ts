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
export const maxDuration = 300;

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

type CsvInput = {
  content: string;
  fileName: string;
};

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

const normalizeHeader = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const OPERATIONAL_TARGET_KEYWORDS = [
  "motorpower",
  "rpm",
  "torque",
  "outletpressure",
  "pressure",
  "airflow",
  "flow",
  "pumppower",
  "wpumppower",
];

const looksNumeric = (value: string): boolean => {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  return normalized.length > 0 && Number.isFinite(Number(normalized));
};

const detectOperationalTargets = (preview: CsvPreview): string[] => {
  return preview.headers.filter((header) => {
    const normalized = normalizeHeader(header);
    if (normalized === "id" || normalized === "row" || normalized === "index") return false;
    const hasNumericSample = preview.firstFiveRows.some((row) => looksNumeric(row[header] ?? ""));
    return hasNumericSample && OPERATIONAL_TARGET_KEYWORDS.some((keyword) => normalized.includes(keyword));
  });
};

const buildIndustrialOptimizationInstruction = (targets: string[]): string => {
  const motorPower = targets.find((item) => normalizeHeader(item).includes("motorpower")) ?? "motor_power";
  const rpm = targets.find((item) => normalizeHeader(item).includes("rpm")) ?? "rpm";
  const torque = targets.find((item) => normalizeHeader(item).includes("torque")) ?? "torque";
  const pressure =
    targets.find((item) => normalizeHeader(item).includes("outletpressure")) ??
    targets.find((item) => normalizeHeader(item).includes("pressure")) ??
    "outlet_pressure_bar";

  return [
    "1. Veri setindeki her bir satiri al.",
    `2. '${motorPower}' degerini minimize etmeye calisirken, '${torque}' ve '${pressure}' degerlerinin belirli bir esik degerin uzerinde oldugundan emin ol.`,
    `3. Optimizasyon algoritmasi kullanarak, '${motorPower}' degerini minimize eden '${rpm}' degerini bul.`,
    `4. Eger birden fazla '${rpm}' degeri ayni minimum '${motorPower}' degerini veriyorsa, en dusuk '${rpm}' degerini sec.`,
    `5. Bulunan optimum '${rpm}' degerini ve karsilik gelen '${motorPower}', '${torque}' ve '${pressure}' degerlerini kaydet.`,
  ].join(" ");
};

const enrichDiagnosisForCsv = (preview: CsvPreview, diagnosis: AiDiagnosis): AiDiagnosis => {
  const operationalTargets = detectOperationalTargets(preview);
  if (operationalTargets.length === 0) return diagnosis;

  const mergedTargets = Array.from(new Set([...(diagnosis.hedef_kolonlar ?? []), ...operationalTargets]));
  const instruction = diagnosis.matematiksel_islem_talimati?.trim()
    ? diagnosis.matematiksel_islem_talimati
    : buildIndustrialOptimizationInstruction(mergedTargets);

  const normalizedInstruction = instruction.toLowerCase();
  const shouldUseIndustrialInstruction =
    normalizedInstruction.includes("%20") ||
    normalizedInstruction.includes("20%") ||
    !normalizedInstruction.includes("motor_power");

  return {
    ...diagnosis,
    hedef_kolonlar: mergedTargets,
    matematiksel_islem_talimati: shouldUseIndustrialInstruction ? buildIndustrialOptimizationInstruction(mergedTargets) : instruction,
  };
};

const buildFallbackDiagnosis = (preview: CsvPreview): AiDiagnosis => {
  const energyKeywords = ["energy", "consumption", "power", "motor", "kw", "kwh", "enerji", "tuketim", "guc"];
  const numericColumns = preview.headers.filter((header) =>
    preview.firstFiveRows.some((row) => looksNumeric(row[header] ?? ""))
  );
  const operationalTargets = detectOperationalTargets(preview);
  const energyColumns = numericColumns.filter((header) => {
    const normalized = normalizeHeader(header);
    return energyKeywords.some((keyword) => normalized.includes(keyword));
  });
  const hedefKolonlar = (operationalTargets.length > 0 ? operationalTargets : energyColumns.length > 0 ? energyColumns : numericColumns).slice(0, 8);

  return {
    tespit:
      hedefKolonlar.length > 0
        ? "Sayisal veri kolonlari uzerinden enerji verimliligi tespiti yapildi."
        : "Genel operasyonel verimlilik tespiti yapildi.",
    hedef_kolonlar: hedefKolonlar,
    matematiksel_islem_talimati:
      operationalTargets.length > 0
        ? buildIndustrialOptimizationInstruction(hedefKolonlar)
        : hedefKolonlar.length > 0
          ? "Belirlenen sayisal tuketim/performans kolonlarina %20 azaltim senaryosu uygula; mevcut toplam ile optimize toplam arasindaki farki tasarruf olarak hesapla."
        : "Uygun sayisal hedef kolon bulunamazsa veri kalitesini raporla ve operasyonel iyilestirme icin %20 verimlilik varsayimi kullan.",
  };
};

const buildFallbackEngineeringReport = (summary: ReturnType<typeof buildOptimizationSummary>) => {
  return [
    "## Enerji Tasarruf Analizi Raporu",
    "",
    "### Mevcut Durum",
    `${summary.rowCount} satirlik veri seti uzerinden mevcut toplam enerji tuketimi ${summary.oldTotalEnergy} olarak hesaplandi.`,
    "",
    "### Uygulanan Optimizasyon",
    summary.optimizationMethod,
    "",
    "### Sayisal Kazanim",
    `Optimize senaryoda yeni toplam enerji ${summary.newTotalEnergy}, hesaplanan tasarruf ise ${summary.energySaved} seviyesindedir.`,
    "",
    "### Not",
    "Bu teknik ozet, mevcut hesap sonuclarinin okunabilir kalmasi icin sistem tarafindan uretilmistir.",
  ].join("\n");
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

  try {
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

    return enrichDiagnosisForCsv(preview, await parseDiagnosisJson(rawJson));
  } catch (error) {
    console.warn(
      "AI diagnosis failed, using deterministic CSV fallback:",
      error instanceof Error ? error.message : error
    );
    return enrichDiagnosisForCsv(preview, buildFallbackDiagnosis(preview));
  }
};

const readCsvInput = async (request: NextRequest, serviceSupabase: ReturnType<typeof createServiceClient>): Promise<CsvInput> => {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("CSV dosyasi gerekli.");
    }

    if (file.size > MAX_DOWNLOAD_SIZE_BYTES) {
      throw new Error("CSV dosyasi cok buyuk. Maksimum 25MB desteklenir.");
    }

    return {
      content: await file.text(),
      fileName: file.name || "analysis.csv",
    };
  }

  const body = (await request.json().catch(() => ({}))) as AnalyzeCsvBody;
  const filePath = String(body.filePath ?? "").trim();
  const fallbackFileName = decodeURIComponent(filePath.split("/").pop() ?? "analysis.csv");
  const fileName = String(body.fileName ?? "").trim() || fallbackFileName;

  if (!filePath) {
    throw new Error("filePath zorunludur.");
  }

  const { data, error } = await serviceSupabase.storage.from(RAW_FILES_BUCKET).download(filePath);

  if (error || !data) {
    throw new Error(error?.message ?? "Dosya Supabase Storage'dan okunamadi.");
  }

  if (data.size > MAX_DOWNLOAD_SIZE_BYTES) {
    throw new Error("CSV dosyasi cok buyuk. Maksimum 25MB desteklenir.");
  }

  return {
    content: await data.text(),
    fileName,
  };
};

export async function POST(request: NextRequest) {
  try {
    const serviceSupabase = createServiceClient();
    const { content: csvContent, fileName } = await readCsvInput(request, serviceSupabase);
    const parsedCsv = parseFullCsvContent(csvContent);
    const preview = buildPreviewFromFullRows(parsedCsv);
    const csvPreview = buildCsvPreviewPayload(parsedCsv);
    const aiResult = await callGeminiForDiagnosis(preview);
    const summary = buildOptimizationSummary(parsedCsv, aiResult);
    const oeeSummary = buildOeeSummary(parsedCsv, summary);
    const contributionSummary = buildColumnContributions(parsedCsv, aiResult, 8);
    const anomalies = detectTopAnomalies(parsedCsv, 6);
    const [report, actionPlan, practiceProblems, advancedInsights] = await Promise.all([
      generateEngineeringReport(
        summary,
        {
          oeeSummary,
          contributionSummary,
          anomalies,
          csvPreview: {
            headers: csvPreview.headers,
            numericSummary: csvPreview.numericSummary,
          },
        },
        { timeoutMs: 45000 }
      ).catch((error) => {
        console.warn("AI engineering report failed, using fallback:", error instanceof Error ? error.message : error);
        return buildFallbackEngineeringReport(summary);
      }),
      generateOeeActionPlan({ optimizationMethod: summary.optimizationMethod }, { timeoutMs: 18000 }).catch(() => [
        "Ekipman izleme ve periyodik bakim planini enerji tuketimi anomalilerine gore guncelle.",
        "RPM, motor gucu, tork ve cikis basinci iliskisini haftalik olarak izleyerek sapmalari erken tespit et.",
        "Kalite ve performans kayiplarini azaltmak icin kritik esik degerleri saha kosullarina gore dogrula.",
      ]),
      generatePracticeProblems({
        summary,
        oeeSummary,
        diagnosis: aiResult,
        contributions: contributionSummary,
        anomalies,
        parsedCsv,
      }).catch(() =>
        "## Ornek Soru Uretimi\nBu calistirmada otomatik soru-cozum uretimi tamamlanamadi. Mevcut analiz raporlari gecerlidir."
      ),
      generateAdvancedInsights({
        summary,
        oeeSummary,
        contributions: contributionSummary,
        anomalies,
      }).catch(() => "### Uzman Notu\nEk uzman icgorusu bu calistirmada uretilemedi. Mevcut rapor ve metrikler gecerlidir."),
    ]);

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

    let analysisResultId: string | null = null;
    let saveMessage: string | null = null;

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

    // Serialization safe response - remove circular refs
    const safeResponse = {
      success: true,
      summary: summary ?? {},
      oeeSummary: oeeSummary ?? {},
      contributionSummary: contributionSummary ?? [],
      anomalies: anomalies ?? [],
      csvPreview: csvPreview ?? { headers: [], rows: [], numericSummary: [] },
      report: String(report ?? ""),
      practiceProblems: String(practiceProblems ?? ""),
      advancedInsights: String(advancedInsights ?? ""),
      actionPlan: Array.isArray(actionPlan) ? actionPlan : [],
      analysisResultId: analysisResultId ?? null,
      saveMessage: saveMessage ?? null,
    };

    return NextResponse.json(safeResponse, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Beklenmeyen bir hata olustu.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
