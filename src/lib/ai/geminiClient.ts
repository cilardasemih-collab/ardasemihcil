type GeminiRequest = {
  prompt: string;
  responseMimeType?: "application/json" | "text/plain";
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};

type GeminiResult = {
  text: string;
  model: string;
};

const DEFAULT_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro-latest", "gemini-1.5-flash"];

const getModelCandidates = (): string[] => {
  const fromEnv = String(process.env.GOOGLE_AI_MODEL ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set([...fromEnv, ...DEFAULT_MODELS]));
};

export const generateGeminiText = async (params: GeminiRequest): Promise<GeminiResult> => {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY tanimli degil.");
  }

  const models = getModelCandidates();
  const timeoutMs = params.timeoutMs ?? 45000;
  const errors: string[] = [];

  for (const model of models) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: params.prompt }] }],
            generationConfig: {
              temperature: params.temperature ?? 0.2,
              maxOutputTokens: params.maxOutputTokens ?? 1024,
              ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
            },
          }),
        }
      );

      const responseText = await response.text();
      if (!response.ok) {
        // If model is invalid or not available, try next candidate.
        if (response.status === 404 || response.status === 400) {
          errors.push(`${model}: ${responseText}`);
          continue;
        }
        throw new Error(`Gemini hatasi (${model}): ${responseText}`);
      }

      const payload = JSON.parse(responseText) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
      if (!text) {
        throw new Error(`Gemini bos cevap dondu (${model}).`);
      }

      return { text, model };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Gemini istegi zaman asimina ugradi.");
      }
      if (error instanceof Error) {
        errors.push(`${model}: ${error.message}`);
      } else {
        errors.push(`${model}: bilinmeyen hata`);
      }
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw new Error(
    `AI servisi ulasilamadi. Denenen modeller: ${models.join(", ")}. Ayrintilar: ${errors.slice(0, 2).join(" | ")}`
  );
};
