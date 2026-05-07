import { generateEmbedding } from "@/lib/ai/embeddingClient";
import { createServiceClient } from "@/lib/supabase/server";
import type { ScenarioSummaryPayload } from "@/services/aiOrchestrator";

type RetrievedChunk = {
  id: string;
  content: string;
  metadata: {
    documentName?: string;
    pageNumber?: number;
    sheetName?: string;
    citationLabel?: string;
    [key: string]: unknown;
  };
  similarity: number;
};

type LearnedRule = {
  id: string;
  rule_description: string;
  category: string;
  scope: string;
  project_id: string | null;
  apply_count: number;
  similarity: number;
};

const buildSearchQueries = (payload: ScenarioSummaryPayload) => {
  const queries = new Set<string>();
  const uKeys = Object.keys(payload.scenario.uValues);

  queries.add("isi yalitim katsayisi U degeri TS 825");

  if (uKeys.length > 0) {
    queries.add(`U degeri ${uKeys.join(" ")} bina kabugu mevzuat siniri`);
  }
  if (payload.scenario.location) {
    queries.add(`${payload.scenario.location} iklim bolgesi bina enerjisi standardi`);
  }
  if ((payload.summary.metrics.heatingLoad.max ?? 0) > 0) {
    queries.add("isitma yuku sinir degerleri ve enerji performansi");
  }
  if ((payload.summary.metrics.coolingLoad.max ?? 0) > 0) {
    queries.add("sogutma yuku enerji performansi ve bina standardi");
  }
  if (payload.summary.detectedAnomalies.length > 0) {
    queries.add("fiziksel imkansizlik sicaklik nem degerleri muhendislik kontrolu");
  }

  return Array.from(queries).slice(0, 5);
};

export async function retrieveRelevantDocuments(payload: ScenarioSummaryPayload, limit = 5) {
  const supabase = createServiceClient();
  const queries = buildSearchQueries(payload);
  const merged = new Map<string, RetrievedChunk>();

  for (const query of queries) {
    const embeddingResult = await generateEmbedding(query);
    const { data, error } = await supabase.rpc("match_documents", {
      query_embedding: embeddingResult.embedding,
      match_count: limit,
      filter: {},
    });

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as RetrievedChunk[];
    for (const row of rows) {
      const existing = merged.get(row.id);
      if (!existing || row.similarity > existing.similarity) {
        merged.set(row.id, row);
      }
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export function formatRetrievedContext(chunks: RetrievedChunk[]) {
  if (chunks.length === 0) {
    return "Ek teknik baglam bulunamadi.";
  }

  return chunks
    .map((chunk, index) => {
      const citation =
        chunk.metadata.citationLabel ??
        chunk.metadata.documentName ??
        `Dokuman ${index + 1}`;

      return [
        `Context ${index + 1}`,
        `Citation: ${citation}`,
        `Similarity: ${chunk.similarity.toFixed(4)}`,
        chunk.content,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

export async function retrieveLearnedRules(payload: ScenarioSummaryPayload, limit = 5) {
  const supabase = createServiceClient();
  const queries = buildSearchQueries(payload);
  const merged = new Map<string, LearnedRule>();

  for (const query of queries) {
    const embeddingResult = await generateEmbedding(
      [
        query,
        `project:${payload.scenario.projectName}`,
        `location:${payload.scenario.location ?? "-"}`,
        `uValues:${JSON.stringify(payload.scenario.uValues)}`,
      ].join("\n")
    );

    const { data, error } = await supabase.rpc("match_learned_rules", {
      query_embedding: embeddingResult.embedding,
      match_count: limit,
      target_project_id: payload.scenario.projectId ?? null,
    });

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as LearnedRule[];
    for (const row of rows) {
      const existing = merged.get(row.id);
      if (!existing || row.similarity > existing.similarity) {
        merged.set(row.id, row);
      }
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      return b.apply_count - a.apply_count;
    })
    .slice(0, limit);
}

export function formatLearnedRules(rules: LearnedRule[]) {
  if (rules.length === 0) {
    return "Gecmis muhendis geri bildirimlerinden gelen ek kural bulunamadi.";
  }

  return rules
    .map((rule, index) => {
      const scopeLabel = rule.scope === "project" ? "Projeye Ozel" : "Genel";
      return `${index + 1}. [${scopeLabel} | ${rule.category} | apply_count=${rule.apply_count}] ${rule.rule_description}`;
    })
    .join("\n");
}
