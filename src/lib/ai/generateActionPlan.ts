import { generateGeminiText } from "@/lib/ai/geminiClient";

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
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const { text: rawJson } = await generateGeminiText({
    prompt: buildPrompt(input),
    responseMimeType: "application/json",
    temperature: 0.25,
    maxOutputTokens: 350,
    timeoutMs,
  });

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
};
