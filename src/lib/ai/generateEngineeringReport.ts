import { generateGeminiText } from "@/lib/ai/geminiClient";

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
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const { text: report } = await generateGeminiText({
    prompt: buildReportPrompt(summary),
    temperature: 0.2,
    maxOutputTokens: 1800,
    timeoutMs,
  });

  return report;
};
