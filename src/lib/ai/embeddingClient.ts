const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL?.trim() || "text-embedding-004";
const TARGET_DIMENSION = 1536;

const normalizeEmbeddingLength = (input: number[]) => {
  if (input.length === TARGET_DIMENSION) return input;
  if (input.length > TARGET_DIMENSION) return input.slice(0, TARGET_DIMENSION);
  return [...input, ...new Array(TARGET_DIMENSION - input.length).fill(0)];
};

const generateOpenAiEmbedding = async (text: string): Promise<{ embedding: number[]; model: string; provider: "openai" }> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY tanimli degil.");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: text,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{ embedding?: number[] }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "OpenAI embedding istegi basarisiz oldu.");
  }

  const embedding = payload.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("OpenAI embedding cevabi bos dondu.");
  }

  return {
    embedding: normalizeEmbeddingLength(embedding),
    model: OPENAI_EMBEDDING_MODEL,
    provider: "openai",
  };
};

const generateGeminiEmbedding = async (text: string): Promise<{ embedding: number[]; model: string; provider: "gemini" }> => {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY tanimli degil.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: {
          parts: [{ text }],
        },
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: TARGET_DIMENSION,
      }),
    }
  );

  const payload = (await response.json().catch(() => ({}))) as {
    embedding?: { values?: number[] };
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Gemini embedding istegi basarisiz oldu.");
  }

  const values = payload.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Gemini embedding cevabi bos dondu.");
  }

  return {
    embedding: normalizeEmbeddingLength(values),
    model: GEMINI_EMBEDDING_MODEL,
    provider: "gemini",
  };
};

export async function generateEmbedding(text: string) {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateOpenAiEmbedding(text);
    } catch {
      // Fall back to Gemini if OpenAI embeddings are unavailable.
    }
  }

  return generateGeminiEmbedding(text);
}
