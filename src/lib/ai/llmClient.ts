import { generateGeminiText } from "@/lib/ai/geminiClient";

type LlmProvider = "auto" | "openai" | "gemini";

type GenerateLlmTextParams = {
  systemPrompt: string;
  userPrompt: string;
  responseMimeType?: "application/json" | "text/plain";
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  provider?: LlmProvider;
};

type LlmResult = {
  text: string;
  model: string;
  provider: Exclude<LlmProvider, "auto">;
};

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";

const generateOpenAiText = async (params: GenerateLlmTextParams): Promise<LlmResult> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY tanimli degil.");
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), params.timeoutMs ?? 45000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEFAULT_OPENAI_MODEL,
        temperature: params.temperature ?? 0.2,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        response_format:
          params.responseMimeType === "application/json"
            ? { type: "json_object" }
            : undefined,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    };

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "OpenAI istegi basarisiz oldu.");
    }

    const content = payload.choices?.[0]?.message?.content;
    const text =
      typeof content === "string"
        ? content.trim()
        : Array.isArray(content)
          ? content.map((item) => item.text ?? "").join("\n").trim()
          : "";

    if (!text) {
      throw new Error("OpenAI bos cevap dondu.");
    }

    return {
      text,
      model: DEFAULT_OPENAI_MODEL,
      provider: "openai",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenAI istegi zaman asimina ugradi.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

export const generateLlmText = async (params: GenerateLlmTextParams): Promise<LlmResult> => {
  const provider = params.provider ?? "gemini";

  if (provider === "openai") {
    return generateOpenAiText(params);
  }

  if (provider === "gemini") {
    const result = await generateGeminiText({
      prompt: `${params.systemPrompt}\n\n${params.userPrompt}`,
      responseMimeType: params.responseMimeType,
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
      timeoutMs: params.timeoutMs,
    });
    return { ...result, provider: "gemini" };
  }

  const result = await generateGeminiText({
    prompt: `${params.systemPrompt}\n\n${params.userPrompt}`,
    responseMimeType: params.responseMimeType,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
    timeoutMs: params.timeoutMs,
  });

  return { ...result, provider: "gemini" };
};
