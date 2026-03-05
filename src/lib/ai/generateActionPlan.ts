type GenerateActionPlanInput = {
  optimizationMethod: string;
};

type GenerateActionPlanOptions = {
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30000;

const buildPrompt = (input: GenerateActionPlanInput): string => {
  return [
    "Sen fabrikalara OEE (Genel Ekipman Verimliligi) danismanligi yapan bir uzmansin.",
    `Sistemimiz az once ${input.optimizationMethod} kullanarak bir miktar tasarruf sagladi.`,
    "Simdi bu fabrikadaki muhendislere, OEE oranlarini (ozellikle Kullanilabilirlik, Performans ve Kalite) daha da artirabilmeleri icin donanimsal veya sistemsel 3 adet uygulanabilir, pratik aksiyon maddesi yaz.",
    "Yanitin sadece 3 maddelik kisa bir liste olsun.",
    "Yanit formati zorunlu: Sadece JSON dizi. Ornek: [\"Aksiyon 1\", \"Aksiyon 2\", \"Aksiyon 3\"]",
  ].join("\n");
};

export const generateOeeActionPlan = async (
  input: GenerateActionPlanInput,
  options?: GenerateActionPlanOptions
): Promise<string[]> => {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY tanimli degil.");
  }

  const model = process.env.GOOGLE_AI_MODEL || "gemini-1.5-flash";
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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
          contents: [{ parts: [{ text: buildPrompt(input) }] }],
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 350,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI OEE tavsiye servisi hatasi: ${errorText}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const rawJson = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
    if (!rawJson) {
      throw new Error("AI OEE tavsiye yaniti bos dondu.");
    }

    const parsed = JSON.parse(rawJson) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("AI OEE tavsiye yaniti beklenen formatta degil.");
    }

    const normalized = parsed.map((item) => String(item).trim()).filter(Boolean).slice(0, 3);
    if (normalized.length === 0) {
      throw new Error("AI OEE tavsiye listesi bos dondu.");
    }

    return normalized;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI OEE aksiyon plani istegi zaman asimina ugradi.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
};
