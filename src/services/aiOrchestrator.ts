import { z } from "zod";

import {
  ANALYST_SYSTEM_PROMPT,
  AUDITOR_SYSTEM_PROMPT,
  REPORTER_SYSTEM_PROMPT,
} from "@/constants/prompts";
import { generateLlmText } from "@/lib/ai/llmClient";
import {
  formatLearnedRules,
  formatRetrievedContext,
  retrieveLearnedRules,
  retrieveRelevantDocuments,
} from "@/services/retrievalService";

const peakPointSchema = z.object({
  value: z.number(),
  timestamp: z.string(),
  zoneName: z.string(),
});

const analystResponseSchema = z.object({
  executiveSummary: z.string(),
  trendFindings: z.array(z.string()).min(1),
  peakHeatingLoad: peakPointSchema.nullable(),
  peakCoolingLoad: peakPointSchema.nullable(),
  anomalies: z.array(
    z.object({
      severity: z.enum(["low", "medium", "high"]),
      metric: z.string(),
      description: z.string(),
      evidence: z.string(),
    })
  ),
  recommendedChecks: z.array(z.string()),
  physicsFlags: z.array(z.string()),
});

const auditorResponseSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  feedback: z.array(z.string()),
});

export type ScenarioSummaryPayload = {
  scenario: {
    id: string;
    projectId?: string | null;
    name: string;
    totalEnergyConsumption: number | null;
    uValues: Record<string, number>;
    projectName: string;
    location: string | null;
  };
  summary: {
    rowCount: number;
    zoneCount: number;
    timeRange: { start: string | null; end: string | null };
    metrics: {
      airTemperature: { min: number | null; max: number | null; avg: number | null };
      heatingLoad: { min: number | null; max: number | null; avg: number | null; sum: number | null };
      coolingLoad: { min: number | null; max: number | null; avg: number | null; sum: number | null };
      humidity: { min: number | null; max: number | null; avg: number | null };
    };
    peaks: {
      heating: { value: number; timestamp: string; zoneName: string } | null;
      cooling: { value: number; timestamp: string; zoneName: string } | null;
    };
    topZonesByHeating: Array<{ zoneName: string; value: number }>;
    topZonesByCooling: Array<{ zoneName: string; value: number }>;
    detectedAnomalies: string[];
  };
};

export type OrchestratorTraceItem = {
  stage: "preprocess" | "analyst" | "auditor" | "reporter" | "completed";
  message: string;
};

export type ScenarioAnalysisResult = {
  trace: OrchestratorTraceItem[];
  analyst: z.infer<typeof analystResponseSchema>;
  audit: z.infer<typeof auditorResponseSchema>;
  report: string;
  provider: string;
  model: string;
  retriesUsed: number;
  retrievedContext: string;
  learnedRulesContext: string;
};

const safeJsonParse = <T>(text: string, schema: z.ZodSchema<T>): T => {
  const sanitized = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = sanitized.indexOf("{");
  const end = sanitized.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? sanitized.slice(start, end + 1) : sanitized;
  return schema.parse(JSON.parse(candidate));
};

const buildAnalystUserPrompt = (
  payload: ScenarioSummaryPayload,
  auditFeedback: string[],
  learnedRulesContext: string
) => {
  return [
    "Analyze the structured scenario summary below and return JSON only.",
    "IMPORTANT: Apply these learned engineer rules if relevant:",
    learnedRulesContext,
    "Required schema:",
    JSON.stringify(
      {
        executiveSummary: "string",
        trendFindings: ["string"],
        peakHeatingLoad: { value: 0, timestamp: "ISO", zoneName: "string" },
        peakCoolingLoad: { value: 0, timestamp: "ISO", zoneName: "string" },
        anomalies: [{ severity: "low|medium|high", metric: "string", description: "string", evidence: "string" }],
        recommendedChecks: ["string"],
        physicsFlags: ["string"],
      },
      null,
      2
    ),
    auditFeedback.length > 0 ? `Previous auditor feedback:\n${auditFeedback.map((item) => `- ${item}`).join("\n")}` : "",
    "Scenario summary:",
    JSON.stringify(payload, null, 2),
  ]
    .filter(Boolean)
    .join("\n\n");
};

const buildAuditorUserPrompt = (
  payload: ScenarioSummaryPayload,
  analystOutput: z.infer<typeof analystResponseSchema>,
  retrievedContext: string,
  learnedRulesContext: string
) => {
  return [
    "Review the analyst output against the structured scenario summary.",
    "Approve only if the findings are numerically consistent and physically plausible.",
    "If the retrieved context contains standards, regulations, or company rules, use them in your feedback and include citations.",
    "Also validate against learned engineer rules. Reject the section if it violates a strong learned rule.",
    "DİKKAT: Gecmis muhendis geri bildirimlerine dayanan su kurallari UYGULA:",
    learnedRulesContext,
    'Return JSON only: { "status": "APPROVED" | "REJECTED", "feedback": ["..."] }.',
    "Retrieved context:",
    retrievedContext,
    "Scenario summary:",
    JSON.stringify(payload, null, 2),
    "Analyst output:",
    JSON.stringify(analystOutput, null, 2),
  ].join("\n\n");
};

const buildReporterUserPrompt = (
  payload: ScenarioSummaryPayload,
  analystOutput: z.infer<typeof analystResponseSchema>,
  language: "tr" | "en",
  learnedRulesContext: string
) => {
  return [
    `Write the final engineering report in ${language === "tr" ? "Turkish" : "English"}.`,
    "Use short Markdown sections for: scenario overview, key trends, peak loads, anomalies and engineering conclusion.",
    "Keep the tone professional and technical.",
    "If any approved feedback cites a document, preserve the citation exactly in the report.",
    "Respect these learned engineer rules where relevant:",
    learnedRulesContext,
    "Approved scenario summary:",
    JSON.stringify(payload, null, 2),
    "Approved analyst findings:",
    JSON.stringify(analystOutput, null, 2),
  ].join("\n\n");
};

export async function runScenarioAiOrchestration(input: {
  payload: ScenarioSummaryPayload;
  language: "tr" | "en";
}): Promise<ScenarioAnalysisResult> {
  const retrievedChunks = await retrieveRelevantDocuments(input.payload, 5);
  const retrievedContext = formatRetrievedContext(retrievedChunks);
  const learnedRules = await retrieveLearnedRules(input.payload, 5);
  const learnedRulesContext = formatLearnedRules(learnedRules);
  const trace: OrchestratorTraceItem[] = [
    { stage: "preprocess", message: "Scenario ozeti hazirlandi, AI ajanlari icin token-verimli paket olusturuldu." },
    {
      stage: "preprocess",
      message:
        retrievedChunks.length > 0
          ? `${retrievedChunks.length} adet mevzuat/teknik dokuman parcasi Denetci icin baglama eklendi.`
          : "Mevzuat baglami bulunamadi; Denetci yalnizca sayisal ozete gore kontrol yapacak.",
    },
    {
      stage: "preprocess",
      message:
        learnedRules.length > 0
          ? `${learnedRules.length} adet ogrenilmis muhendislik kurali analiz akisina enjekte edildi.`
          : "Ogrenilmis kural bulunamadi; varsayilan sistem davranisi kullanilacak.",
    },
  ];

  let retriesUsed = 0;
  let analystOutput: z.infer<typeof analystResponseSchema> | null = null;
  let auditOutput: z.infer<typeof auditorResponseSchema> | null = null;
  let model = "";
  let provider = "";
  let auditFeedback: string[] = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    trace.push({
      stage: "analyst",
      message: `Analizci verileri inceliyor${attempt > 0 ? ` (tekrar ${attempt})` : ""}.`,
    });

    const analystResult = await generateLlmText({
      systemPrompt: ANALYST_SYSTEM_PROMPT,
      userPrompt: buildAnalystUserPrompt(input.payload, auditFeedback, learnedRulesContext),
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 1400,
      timeoutMs: 45000,
    });

    analystOutput = safeJsonParse(analystResult.text, analystResponseSchema);
    provider = analystResult.provider;
    model = analystResult.model;

    trace.push({
      stage: "auditor",
      message: "Denetci Analizci bulgularini fiziksel tutarlilik ve mantik acisindan sorguluyor.",
    });

    const auditorResult = await generateLlmText({
      systemPrompt: AUDITOR_SYSTEM_PROMPT,
      userPrompt: buildAuditorUserPrompt(input.payload, analystOutput, retrievedContext, learnedRulesContext),
      responseMimeType: "application/json",
      temperature: 0,
      maxOutputTokens: 900,
      timeoutMs: 30000,
    });

    auditOutput = safeJsonParse(auditorResult.text, auditorResponseSchema);

    if (auditOutput.status === "APPROVED") {
      trace.push({
        stage: "auditor",
        message: "Denetci onay verdi. Bulgular raporlama icin kilitlendi.",
      });
      break;
    }

    auditFeedback = auditOutput.feedback;
    retriesUsed += 1;
    trace.push({
      stage: "auditor",
      message: `Denetci revizyon istedi: ${auditOutput.feedback.join(" | ") || "Gerekce belirtilmedi."}`,
    });
  }

  if (!analystOutput || !auditOutput) {
    throw new Error("AI orkestrasyonu tamamlanamadi.");
  }

  if (auditOutput.status !== "APPROVED") {
    throw new Error(`Denetci analizi reddetti: ${auditOutput.feedback.join(" | ")}`);
  }

  trace.push({
    stage: "reporter",
    message: "Raporlayici onayli bulgulardan teknik raporu uretiyor.",
  });

  const reporterResult = await generateLlmText({
    systemPrompt: REPORTER_SYSTEM_PROMPT,
    userPrompt: buildReporterUserPrompt(input.payload, analystOutput, input.language, learnedRulesContext),
    temperature: 0.2,
    maxOutputTokens: 1600,
    timeoutMs: 45000,
  });

  trace.push({
    stage: "completed",
    message: "Multi-agent analiz tamamlandi.",
  });

  return {
    trace,
    analyst: analystOutput,
    audit: auditOutput,
    report: reporterResult.text.trim(),
    provider: reporterResult.provider,
    model: reporterResult.model,
    retriesUsed,
    retrievedContext,
    learnedRulesContext,
  };
}
