import { z } from "zod";

import { generateLlmText } from "@/lib/ai/llmClient";
import { createServiceClient } from "@/lib/supabase/server";
import {
  formatLearnedRules,
  formatRetrievedContext,
  retrieveLearnedRules,
  retrieveRelevantDocuments,
} from "@/services/retrievalService";
import type { ScenarioSummaryPayload } from "@/services/aiOrchestrator";
import {
  REPORT_SECTION_DEFINITIONS,
  type ReportGenerationStatus,
  type ReportSectionDefinition,
  type ReportSectionKey,
  type ReportSectionRecord,
} from "@/types/report";

const sectionPayloadSchema = z.object({
  markdown: z.string(),
  summary: z.string(),
});

const SECTION_GENERATION_TIMEOUT_MS = 12000;
const REPORT_GENERATION_BUDGET_MS = 90000;

type SectionMemoryItem = { title: string; summary: string };

const sectionPromptForLanguage = (language: "tr" | "en") =>
  language === "tr"
    ? "Cevabi Turkce yaz. Markdown kullan. Gerekli durumlarda alinti yaptigin kurallar icin dokuman adini ve sayfa numarasini parantez icinde ver."
    : "Write in English using Markdown. Whenever you cite a rule or standard, append the document name and page number in parentheses.";

const buildSectionPrompt = (input: {
  section: ReportSectionDefinition;
  language: "tr" | "en";
  scenarioSummary: ScenarioSummaryPayload;
  retrievedContext: string;
  memory: SectionMemoryItem[];
  learnedRulesContext: string;
}) => {
  return [
    "You are a senior technical documentation architect producing one section of a professional DesignBuilder report.",
    sectionPromptForLanguage(input.language),
    "DİKKAT: Geçmiş mühendis geri bildirimlerine dayanan şu kuralları UYGULA:",
    input.learnedRulesContext,
    "Return JSON only with this schema:",
    JSON.stringify({ markdown: "string", summary: "string" }, null, 2),
    `Current section: ${input.section.title}`,
    `Goal: ${input.section.goal}`,
    input.memory.length > 0
      ? `Critical memory from previous sections:\n${input.memory.map((item) => `- ${item.title}: ${item.summary}`).join("\n")}`
      : "There are no previous sections yet.",
    "Scenario summary:",
    JSON.stringify(input.scenarioSummary, null, 2),
    "Retrieved technical context:",
    input.retrievedContext,
    "Write this section with enough depth to support a professional report without unnecessary verbosity.",
    "Target roughly 300-500 words, use clear subheadings, short technical paragraphs, bullet lists, tables when helpful, and explicit engineering interpretation.",
  ].join("\n\n");
};

const loadRetrievedContext = async (scenarioSummary: ScenarioSummaryPayload) => {
  try {
    return formatRetrievedContext(await retrieveRelevantDocuments(scenarioSummary, 5));
  } catch {
    return "Harici mevzuat baglami su anda kullanilamiyor. Yorum yalnizca mevcut simulasyon ozetine dayandirilsin.";
  }
};

const loadLearnedRulesContext = async (scenarioSummary: ScenarioSummaryPayload) => {
  try {
    return formatLearnedRules(await retrieveLearnedRules(scenarioSummary, 5));
  } catch {
    return "Ogrenilmis kural bulunamadi.";
  }
};

const buildFallbackSection = (input: {
  section: ReportSectionDefinition;
  language: "tr" | "en";
  scenarioSummary: ScenarioSummaryPayload;
  memory: SectionMemoryItem[];
}) => {
  const metrics = input.scenarioSummary.summary.metrics;
  const peaks = input.scenarioSummary.summary.peaks;
  const anomalies = input.scenarioSummary.summary.detectedAnomalies;
  const previous = input.memory.length > 0 ? input.memory.map((item) => item.title).join(", ") : "onceki bolum yok";
  const baseLines =
    input.language === "tr"
      ? [
          `## ${input.section.title}`,
          "",
          `Bu bolum, **${input.scenarioSummary.scenario.name}** senaryosu icin yerel fallback rapor motoru tarafindan uretilmistir. AI servisi veya dis veri kaynagi gecici olarak kullanilamasa da muhendislik acisindan yorumlanabilir bir teknik iskelet olusturulmustur.`,
          "",
          `### Kapsam`,
          `- Proje: ${input.scenarioSummary.scenario.projectName}`,
          `- Konum: ${input.scenarioSummary.scenario.location ?? "Belirtilmedi"}`,
          `- Veri satiri: ${input.scenarioSummary.summary.rowCount}`,
          `- Zon sayisi: ${input.scenarioSummary.summary.zoneCount}`,
          `- Onceki baglam: ${previous}`,
          "",
          `### Temel Bulgular`,
          `- Toplam isitma yuku: ${metrics.heatingLoad.sum ?? 0} kWh`,
          `- Toplam sogutma yuku: ${metrics.coolingLoad.sum ?? 0} kWh`,
          `- Ortalama ic hava sicakligi: ${metrics.airTemperature.avg ?? "-"} C`,
          `- Ortalama bagil nem: ${metrics.humidity.avg ?? "-"} %`,
          `- Pik isitma: ${peaks.heating?.value ?? "-"} ${peaks.heating ? `(${peaks.heating.zoneName})` : ""}`,
          `- Pik sogutma: ${peaks.cooling?.value ?? "-"} ${peaks.cooling ? `(${peaks.cooling.zoneName})` : ""}`,
          "",
          `### Muhendislik Yorumu`,
          `${input.section.goal} Bu fallback metin, senaryo ozetindeki nicel verileri koruyarak raporun ilerlemesini saglar. Nihai teslim oncesinde AI destekli veya muhendis tarafindan zenginlestirilmis revizyon onerilir.`,
          "",
          `### Dikkat Edilmesi Gerekenler`,
          anomalies.length > 0
            ? anomalies.map((item) => `- ${item}`).join("\n")
            : "- Belirgin bir fiziksel anomali tespit edilmedi; yine de orijinal CSV ve model varsayimlari dogrulanmalidir.",
        ]
      : [
          `## ${input.section.title}`,
          "",
          `This section was produced by the local fallback report engine for **${input.scenarioSummary.scenario.name}**. Even when the AI service or external data source is temporarily unavailable, the system maintains a technically readable report structure.`,
          "",
          `### Scope`,
          `- Project: ${input.scenarioSummary.scenario.projectName}`,
          `- Location: ${input.scenarioSummary.scenario.location ?? "Not specified"}`,
          `- Data rows: ${input.scenarioSummary.summary.rowCount}`,
          `- Zone count: ${input.scenarioSummary.summary.zoneCount}`,
          `- Prior context: ${previous}`,
          "",
          `### Key Findings`,
          `- Total heating load: ${metrics.heatingLoad.sum ?? 0} kWh`,
          `- Total cooling load: ${metrics.coolingLoad.sum ?? 0} kWh`,
          `- Average indoor air temperature: ${metrics.airTemperature.avg ?? "-"} C`,
          `- Average relative humidity: ${metrics.humidity.avg ?? "-"} %`,
          `- Peak heating: ${peaks.heating?.value ?? "-"} ${peaks.heating ? `(${peaks.heating.zoneName})` : ""}`,
          `- Peak cooling: ${peaks.cooling?.value ?? "-"} ${peaks.cooling ? `(${peaks.cooling.zoneName})` : ""}`,
          "",
          `### Engineering Interpretation`,
          `${input.section.goal} This fallback text keeps the report moving while preserving the quantitative scenario summary. A later AI-assisted or engineer-authored refinement is recommended before final issue.`,
          "",
          `### Validation Notes`,
          anomalies.length > 0
            ? anomalies.map((item) => `- ${item}`).join("\n")
            : "- No strong physical anomaly was flagged in the summary, but the original CSV and modelling assumptions should still be verified.",
        ];

  return {
    markdown: baseLines.join("\n"),
    summary:
      input.language === "tr"
        ? `${input.section.title} fallback modunda uretildi; enerji, pik yuk ve veri kalitesi bulgulari derlendi.`
        : `${input.section.title} was generated in fallback mode with summarized energy, peak load, and data-quality findings.`,
    provider: "fallback",
    model: "deterministic-template",
  };
};

const normalizeSectionRow = (row: Record<string, unknown>): ReportSectionRecord => ({
  id: String(row.id),
  reportGroupId: String(row.report_group_id),
  scenarioId: String(row.scenario_id),
  language: String(row.language) === "en" ? "en" : "tr",
  reportTitle: String(row.report_title),
  sectionKey: row.section_key as ReportSectionKey,
  sectionTitle: String(row.section_title),
  sectionOrder: Number(row.section_order),
  status: row.status as ReportGenerationStatus,
  sectionContent: String(row.section_content ?? ""),
  initialSectionContent: row.initial_section_content ? String(row.initial_section_content) : null,
  sectionSummary: row.section_summary ? String(row.section_summary) : null,
  reviewStatus:
    row.review_status === "final" ? "final" : row.review_status === "reviewed" ? "reviewed" : "draft",
  lastEditedSource:
    row.last_edited_source === "engineer" ? "engineer" : row.last_edited_source === "refined" ? "refined" : "ai",
  contextSnapshot: (row.context_snapshot as Record<string, unknown> | null) ?? {},
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const parseSectionResponse = (text: string) => {
  const sanitized = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = sanitized.indexOf("{");
  const end = sanitized.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? sanitized.slice(start, end + 1) : sanitized;
  return sectionPayloadSchema.parse(JSON.parse(candidate));
};

const markRemainingSectionsFailed = async (params: {
  reportGroupId: string;
  fromSectionKey: ReportSectionKey;
  message: string;
}) => {
  const startIndex = REPORT_SECTION_DEFINITIONS.findIndex((section) => section.key === params.fromSectionKey);
  if (startIndex < 0) return;

  for (const section of REPORT_SECTION_DEFINITIONS.slice(startIndex)) {
    await updateSectionRow({
      reportGroupId: params.reportGroupId,
      sectionKey: section.key,
      values: {
        status: "failed",
        section_content: "",
        section_summary: params.message,
      },
    });
  }
};

async function updateSectionRow(params: {
  reportGroupId: string;
  sectionKey: ReportSectionKey;
  values: Record<string, unknown>;
}) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("reports")
    .update({
      ...params.values,
      updated_at: new Date().toISOString(),
    })
    .eq("report_group_id", params.reportGroupId)
    .eq("section_key", params.sectionKey);

  if (error) {
    throw new Error(error.message);
  }
}

export async function initializeReportSections(input: {
  reportGroupId: string;
  scenarioId: string;
  language: "tr" | "en";
  reportTitle: string;
}) {
  const supabase = createServiceClient();
  const rows = REPORT_SECTION_DEFINITIONS.map((section) => ({
    report_group_id: input.reportGroupId,
    scenario_id: input.scenarioId,
    language: input.language,
    report_title: input.reportTitle,
    section_key: section.key,
    section_title: section.title,
    section_order: section.order,
    status: "pending",
    section_content: "",
    initial_section_content: "",
    section_summary: null,
    review_status: "draft",
    last_edited_source: "ai",
    context_snapshot: {},
  }));

  const { error } = await supabase.from("reports").upsert(rows, {
    onConflict: "report_group_id,section_key",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function generateSequentialReport(input: {
  reportGroupId: string;
  scenarioSummary: ScenarioSummaryPayload;
  language: "tr" | "en";
}) {
  const retrievedContext = await loadRetrievedContext(input.scenarioSummary);
  const memory: Array<{ title: string; summary: string }> = [];
  let provider = "";
  let model = "";

  for (const section of REPORT_SECTION_DEFINITIONS) {
    await updateSectionRow({
      reportGroupId: input.reportGroupId,
      sectionKey: section.key,
      values: {
        section_content: "",
        section_summary: null,
      },
    });
  }

  return generateReportSectionsFrom({
    reportGroupId: input.reportGroupId,
    scenarioSummary: input.scenarioSummary,
    language: input.language,
    startSectionKey: REPORT_SECTION_DEFINITIONS[0].key,
    initialMemory: memory,
    retrievedContext,
  });
}

export async function generateReportSectionsFrom(input: {
  reportGroupId: string;
  scenarioSummary: ScenarioSummaryPayload;
  language: "tr" | "en";
  startSectionKey: ReportSectionKey;
  initialMemory: Array<{ title: string; summary: string }>;
  retrievedContext?: string;
}) {
  const retrievedContext = input.retrievedContext ?? (await loadRetrievedContext(input.scenarioSummary));
  const learnedRulesContext = await loadLearnedRulesContext(input.scenarioSummary);
  const memory = [...input.initialMemory];
  let provider = "";
  let model = "";
  const startedAt = Date.now();
  const startIndex = REPORT_SECTION_DEFINITIONS.findIndex((section) => section.key === input.startSectionKey);
  const sectionsToGenerate =
    startIndex >= 0 ? REPORT_SECTION_DEFINITIONS.slice(startIndex) : REPORT_SECTION_DEFINITIONS;

  for (const section of sectionsToGenerate) {
    await updateSectionRow({
      reportGroupId: input.reportGroupId,
      sectionKey: section.key,
      values: {
        status: "generating",
        context_snapshot: {
          retrievedContext,
          memory,
        },
      },
    });

    try {
      const result = await generateSingleReportSection({
        section,
        language: input.language,
        scenarioSummary: input.scenarioSummary,
        retrievedContext,
        memory,
        learnedRulesContext,
      });
      const parsed = { markdown: result.markdown, summary: result.summary };
      provider = result.provider;
      model = result.model;

      memory.push({
        title: section.title,
        summary: parsed.summary,
      });

      await updateSectionRow({
        reportGroupId: input.reportGroupId,
        sectionKey: section.key,
        values: {
          status: "completed",
          section_content: parsed.markdown,
          initial_section_content: parsed.markdown,
          section_summary: parsed.summary,
          review_status: "draft",
          last_edited_source: "ai",
          context_snapshot: {
            retrievedContext,
            memory,
            provider: result.provider,
            model: result.model,
          },
        },
      });

      if (Date.now() - startedAt > REPORT_GENERATION_BUDGET_MS) {
        await markRemainingSectionsFailed({
          reportGroupId: input.reportGroupId,
          fromSectionKey: section.key,
          message: "Rapor üretimi zaman sınırını aştı. Kalan bölümler için tekrar deneyin.",
        });
        break;
      }
    } catch (error) {
      await updateSectionRow({
        reportGroupId: input.reportGroupId,
        sectionKey: section.key,
        values: {
          status: "failed",
          section_content: "",
          section_summary: error instanceof Error ? error.message : "Section generation failed.",
        },
      });
      throw error;
    }
  }

  return {
    provider,
    model,
    retrievedContext,
  };
}

export async function generateSingleReportSection(input: {
  section: ReportSectionDefinition;
  language: "tr" | "en";
  scenarioSummary: ScenarioSummaryPayload;
  retrievedContext?: string;
  memory: SectionMemoryItem[];
  learnedRulesContext?: string;
}) {
  const retrievedContext = input.retrievedContext ?? (await loadRetrievedContext(input.scenarioSummary));
  const learnedRulesContext = input.learnedRulesContext ?? (await loadLearnedRulesContext(input.scenarioSummary));

  try {
    const result = await generateLlmText({
      systemPrompt:
        "You produce a single section of a formal engineering report. Respect citations, prior section memory, and keep the writing detailed and technically grounded.",
      userPrompt: buildSectionPrompt({
        section: input.section,
        language: input.language,
        scenarioSummary: input.scenarioSummary,
        retrievedContext,
        memory: input.memory,
        learnedRulesContext,
      }),
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 1200,
      timeoutMs: SECTION_GENERATION_TIMEOUT_MS,
    });

    const parsed = parseSectionResponse(result.text);
    return {
      markdown: parsed.markdown,
      summary: parsed.summary,
      provider: result.provider,
      model: result.model,
    };
  } catch (error) {
    console.warn(`Section ${input.section.title} LLM generation failed, using fallback:`, error instanceof Error ? error.message : error);
    return buildFallbackSection({
      section: input.section,
      language: input.language,
      scenarioSummary: input.scenarioSummary,
      memory: input.memory,
    });
  }
}

export async function listReportSections(input: { scenarioId?: string; reportGroupId?: string }) {
  const supabase = createServiceClient();
  let query = supabase
    .from("reports")
    .select("*")
    .order("section_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (input.scenarioId) {
    query = query.eq("scenario_id", input.scenarioId);
  }
  if (input.reportGroupId) {
    query = query.eq("report_group_id", input.reportGroupId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => normalizeSectionRow(row as Record<string, unknown>));
}

export async function updateReportSectionContent(input: {
  reportGroupId: string;
  sectionKey: ReportSectionKey;
  sectionContent: string;
  lastEditedSource?: "ai" | "engineer" | "refined";
  reviewStatus?: "draft" | "reviewed" | "final";
}) {
  await updateSectionRow({
    reportGroupId: input.reportGroupId,
    sectionKey: input.sectionKey,
    values: {
      section_content: input.sectionContent,
      status: "completed",
      last_edited_source: input.lastEditedSource ?? "engineer",
      review_status: input.reviewStatus ?? "reviewed",
    },
  });
}
