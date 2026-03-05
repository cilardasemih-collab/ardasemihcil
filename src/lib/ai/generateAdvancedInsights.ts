import { generateGeminiText } from "@/lib/ai/geminiClient";
import type { ColumnContribution, AnomalyItem, OeeSummary, OptimizationSummary } from "@/utils/processData";

type Input = {
  summary: OptimizationSummary;
  oeeSummary: OeeSummary;
  contributions: ColumnContribution[];
  anomalies: AnomalyItem[];
};

export const generateAdvancedInsights = async (input: Input): Promise<string> => {
  const prompt = [
    "Sen endustriyel enerji ve OEE konusunda principal seviye danismansin.",
    "Asagidaki ozetlere gore kisa ama derinlikli bir uzman gorusu yaz.",
    "Markdown formatinda don.",
    "Basliklar zorunlu:",
    "1) Kritik Bulgular",
    "2) En Yuksek Etkili Parametreler",
    "3) Operasyonel Risk ve Bakim Onceligi",
    "4) Sonraki 2 Haftalik Uygulama Plani",
    "Veriler:",
    JSON.stringify(input, null, 2),
  ].join("\n");

  const { text } = await generateGeminiText({
    prompt,
    temperature: 0.2,
    maxOutputTokens: 900,
    timeoutMs: 35000,
  });

  return text;
};
