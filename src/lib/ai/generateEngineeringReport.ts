import { generateGeminiText } from "@/lib/ai/geminiClient";

export type OptimizationSummary = {
  rowCount: number;
  oldTotalEnergy: number;
  newTotalEnergy: number;
  energySaved: number;
  optimizationMethod: string;
};

export type EngineeringReportContext = {
  oeeSummary?: {
    availabilityBefore: number;
    availabilityAfter: number;
    performanceBefore: number;
    performanceAfter: number;
    qualityBefore: number;
    qualityAfter: number;
    oeeBefore: number;
    oeeAfter: number;
    oeeGain: number;
  };
  contributionSummary?: Array<{
    column: string;
    oldValue: number;
    newValue: number;
    saved: number;
  }>;
  anomalies?: Array<{
    rowIndex: number;
    column: string;
    value: number;
    zScore: number;
  }>;
  csvPreview?: {
    headers: string[];
    numericSummary: Array<{
      column: string;
      avg: number;
      min: number;
      max: number;
    }>;
  };
};

type GenerateReportOptions = {
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 45000;

const buildReportPrompt = (summary: OptimizationSummary, context?: EngineeringReportContext): string => {
  return [
    "Sen uzman bir Endustriyel Enerji Verimliligi Muhendisisin.",
    "Sana bir fabrikanin/makinenin enerji optimizasyon ozetini ve destekleyici analizlerini veriyorum:",
    JSON.stringify(summary, null, 2),
    context ? JSON.stringify(context, null, 2) : "",
    "",
    "Gorevin, bu sayisal verileri kullanarak karar verici ve saha muhendisi icin profesyonel bir 'Enerji Tasarruf Analizi Raporu' yazmaktir.",
    "Rapor kisa bir ozet degil, teknik rapor niteliginde olmalidir; sayilari yorumla, formulleri acikla, riskleri belirt ve uygulanabilir aksiyonlar ver.",
    "Yasakli ifadeler: AI, yapay zeka, model, fallback, otomatik metin. Raporu dogrudan uzman raporu gibi yaz.",
    "Basliklar zorunlu:",
    "1. Yonetici Ozeti",
    "2. Veri Kapsami ve Guvenilirlik Notu",
    "3. Mevcut Durum Analizi",
    "4. Optimizasyon Yontemi ve Hesap Mantigi",
    "5. Enerji, OEE ve Operasyonel Performans Bulgulari",
    "6. Anomali ve Risk Degerlendirmesi",
    "7. Parasal Etki ve Geri Odeme Yaklasimi (TL varsayimi ile ornek hesap)",
    "8. Uygulama Oncelikleri",
    "9. Sonuc ve Muhendislik Karari",
    "Markdown formatinda don. En az 900 kelime yaz; tablo kullanabilecegin yerlerde Markdown tablo kullan.",
  ].join("\n");
};

export const generateEngineeringReport = async (
  summary: OptimizationSummary,
  contextOrOptions?: EngineeringReportContext | GenerateReportOptions,
  options?: GenerateReportOptions
): Promise<string> => {
  const hasContext =
    contextOrOptions &&
    ("oeeSummary" in contextOrOptions || "contributionSummary" in contextOrOptions || "anomalies" in contextOrOptions || "csvPreview" in contextOrOptions);
  const context = hasContext ? (contextOrOptions as EngineeringReportContext) : undefined;
  const resolvedOptions = hasContext ? options : (contextOrOptions as GenerateReportOptions | undefined);
  const timeoutMs = resolvedOptions?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const { text: report } = await generateGeminiText({
    prompt: buildReportPrompt(summary, context),
    temperature: 0.2,
    maxOutputTokens: 3200,
    timeoutMs,
  });

  return report;
};
