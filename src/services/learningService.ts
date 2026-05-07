import { z } from "zod";

import { generateEmbedding } from "@/lib/ai/embeddingClient";
import { generateLlmText } from "@/lib/ai/llmClient";
import { createServiceClient } from "@/lib/supabase/server";

const learnedRuleSchema = z.object({
  rootCause: z.string(),
  category: z.enum(["thermal", "economic", "legal", "style", "calculation", "operational"]),
  scope: z.enum(["general", "project"]),
  ruleDescription: z.string(),
  confidenceNote: z.string(),
});

type FeedbackLearningInput = {
  feedbackId: string;
  reportGroupId: string;
  sectionKey: string;
  errorType: string;
  feedbackKind: "error" | "preference";
  originalText: string;
  correctedText: string | null;
  engineerNote: string;
};

const parseLearningResponse = (text: string) => {
  const sanitized = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = sanitized.indexOf("{");
  const end = sanitized.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? sanitized.slice(start, end + 1) : sanitized;
  return learnedRuleSchema.parse(JSON.parse(candidate));
};

async function getReportProjectId(reportGroupId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reports")
    .select("scenario_id, scenarios(project_id)")
    .eq("report_group_id", reportGroupId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const row = data as { scenarios?: { project_id?: string | null } | null } | null;
  return row?.scenarios?.project_id ?? null;
}

export async function analyzeFeedbackAndLearn(input: FeedbackLearningInput) {
  const learningPrompt = [
    "You are a post-mortem learning agent for an engineering writing system.",
    "Compare the original text with the engineer correction note and derive one cautious reusable rule.",
    "Avoid overgeneralization. If the correction appears project-specific, scope must be 'project'.",
    "Return JSON only with schema:",
    JSON.stringify(
      {
        rootCause: "string",
        category: "thermal|economic|legal|style|calculation|operational",
        scope: "general|project",
        ruleDescription: "string",
        confidenceNote: "string",
      },
      null,
      2
    ),
    `Feedback kind: ${input.feedbackKind}`,
    `Error type: ${input.errorType}`,
    "Original text:",
    input.originalText,
    input.correctedText ? `Engineer corrected text:\n${input.correctedText}` : "",
    "Engineer note:",
    input.engineerNote,
  ]
    .filter(Boolean)
    .join("\n\n");

  const learningResult = await generateLlmText({
    systemPrompt:
      "You derive durable but cautious engineering system rules from human feedback. Prefer project scope when uncertain.",
    userPrompt: learningPrompt,
    responseMimeType: "application/json",
    temperature: 0,
    maxOutputTokens: 900,
    timeoutMs: 30000,
  });

  const learned = parseLearningResponse(learningResult.text);
  const projectId = learned.scope === "project" ? await getReportProjectId(input.reportGroupId) : null;
  const contextText = [
    `section:${input.sectionKey}`,
    `errorType:${input.errorType}`,
    `feedbackKind:${input.feedbackKind}`,
    `rootCause:${learned.rootCause}`,
    `rule:${learned.ruleDescription}`,
    `engineerNote:${input.engineerNote}`,
  ].join("\n");

  const embedding = await generateEmbedding(contextText);
  const supabase = createServiceClient();
  const { data: similarRows, error: matchError } = await supabase.rpc("match_learned_rules", {
    query_embedding: embedding.embedding,
    match_count: 3,
    target_project_id: projectId,
  });

  if (matchError) {
    throw new Error(matchError.message);
  }

  const similar = ((similarRows ?? []) as Array<{ id: string; category: string; scope: string; similarity: number; apply_count: number }>)
    .find((row) => row.category === learned.category && row.scope === learned.scope && row.similarity >= 0.94);

  if (similar) {
    const { error: updateRuleError } = await supabase
      .from("learned_rules")
      .update({
        apply_count: (similar.apply_count ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", similar.id);

    if (updateRuleError) {
      throw new Error(updateRuleError.message);
    }
  } else {
    const { error: insertError } = await supabase.from("learned_rules").insert({
      rule_description: learned.ruleDescription,
      category: learned.category,
      scope: learned.scope,
      project_id: projectId,
      source_feedback_id: input.feedbackId,
      context_text: contextText,
      context_vector: embedding.embedding,
      apply_count: 1,
    });

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  const aiInterpretation = [
    `Root cause: ${learned.rootCause}`,
    `Category: ${learned.category}`,
    `Scope: ${learned.scope}`,
    `Rule: ${learned.ruleDescription}`,
    `Confidence note: ${learned.confidenceNote}`,
  ].join("\n");

  const { error: updateError } = await supabase
    .from("user_feedback")
    .update({
      ai_interpretation: aiInterpretation,
    })
    .eq("id", input.feedbackId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    ruleDescription: learned.ruleDescription,
    category: learned.category,
    scope: learned.scope,
    aiInterpretation,
  };
}
