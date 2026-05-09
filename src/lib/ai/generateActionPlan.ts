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

const sanitizeJsonText = (raw: string) => {
  const withoutFence = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("[");
  const end = withoutFence.lastIndexOf("]");
  return start >= 0 && end > start ? withoutFence.slice(start, end + 1) : withoutFence;
};

const fallbackActionPlan = (optimizationMethod: string) => [
  `Uygulanan optimizasyon yontemini periyodik KPI takibine bagla: ${optimizationMethod}`,
  "Enerji tuketimi yuksek ekipmanlar icin vardiya bazli izleme ve alarm esikleri tanimla.",
  "Bakim, kalite ve uretim ekipleriyle haftalik OEE kayip analizi toplantisi planla.",
];

export const generateOeeActionPlan = async (
  input: GenerateActionPlanInput,
  options?: GenerateActionPlanOptions
): Promise<string[]> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
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

    const parsed = JSON.parse(sanitizeJsonText(rawJson)) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("AI OEE tavsiye yaniti beklenen formatta degil.");
    }

    const normalized = parsed.map((item) => String(item).trim()).filter(Boolean).slice(0, 3);
    if (normalized.length === 0) {
      throw new Error("AI OEE tavsiye listesi bos dondu.");
    }

    return normalized;
  } catch (error) {
    console.warn("AI OEE action plan failed, using fallback:", error instanceof Error ? error.message : error);
    return fallbackActionPlan(input.optimizationMethod);
  }
};
