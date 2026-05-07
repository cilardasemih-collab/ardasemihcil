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

const sectionPromptForLanguage = (language: "tr" | "en") =>
  language === "tr"
    ? "Cevabi Turkce yaz. Markdown kullan. Gerekli durumlarda alinti yaptigin kurallar icin dokuman adini ve sayfa numarasini parantez icinde ver."
    : "Write in English using Markdown. Whenever you cite a rule or standard, append the document name and page number in parentheses.";

const buildSectionPrompt = (input: {
  section: ReportSectionDefinition;
  language: "tr" | "en";
  scenarioSummary: ScenarioSummaryPayload;
  retrievedContext: string;
  memory: Array<{ title: string; summary: string }>;
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
    "Write this section with enough depth to support a long-form professional report. Use subheadings, bullet lists, and short technical paragraphs.",
  ].join("\n\n");
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
  const retrievedContext = formatRetrievedContext(await retrieveRelevantDocuments(input.scenarioSummary, 5));
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
  const retrievedContext =
    input.retrievedContext ?? formatRetrievedContext(await retrieveRelevantDocuments(input.scenarioSummary, 5));
  const learnedRulesContext = formatLearnedRules(await retrieveLearnedRules(input.scenarioSummary, 5));
  const memory = [...input.initialMemory];
  let provider = "";
  let model = "";
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
      const result = await generateLlmText({
        systemPrompt:
          "You produce a single section of a formal engineering report. Respect citations and previous section memory.",
        userPrompt: buildSectionPrompt({
          section,
          language: input.language,
          scenarioSummary: input.scenarioSummary,
          retrievedContext,
          memory,
          learnedRulesContext,
        }),
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 1800,
        timeoutMs: 45000,
      });

      const parsed = parseSectionResponse(result.text);
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
