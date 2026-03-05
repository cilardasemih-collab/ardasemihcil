export type OptimizationSummary = {
  rowCount: number;
  oldTotalEnergy: number;
  newTotalEnergy: number;
  energySaved: number;
  optimizationMethod: string;
};

type GenerateReportOptions = {
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 45000;

const buildReportPrompt = (summary: OptimizationSummary): string => {
  return [
    "Sen uzman bir Endustriyel Enerji Verimliligi Muhendisisin.",
    "Sana bir fabrikanin/makinenin enerji optimizasyon ozetini veriyorum:",
    JSON.stringify(summary, null, 2),
    "",
    "Gorevin, bu sayisal verileri kullanarak akademik, profesyonel ve ikna edici bir 'Enerji Tasarruf Analizi Raporu' yazmaktir.",
    "Raporda su basliklar olmali:",
    "1. Mevcut Durum Analizi",
    "2. Uygulanan Optimizasyon Yontemi",
    "3. Sayisal Kazanimlar (Matematiksel verileri vurgula)",
    "4. Isletmeye Saglayacagi Cevresel ve Parasal Etkiler (Tahmini birim maliyet uzerinden ornek ver)",
    "Yanitin dogrudan, duzgun bir Markdown (MD) formatinda olmalidir.",
  ].join("\n");
};

export const generateEngineeringReport = async (
  summary: OptimizationSummary,
  options?: GenerateReportOptions
): Promise<string> => {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY tanimli degil.");
  }

  const model = process.env.GOOGLE_AI_MODEL || "gemini-1.5-flash";
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildReportPrompt(summary) }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1800,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI rapor servisi hatasi: ${errorText}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const report = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
    if (!report) {
      throw new Error("AI rapor uretmedi.");
    }

    return report;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI rapor istegi zaman asimina ugradi. Lutfen tekrar deneyin.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
};
