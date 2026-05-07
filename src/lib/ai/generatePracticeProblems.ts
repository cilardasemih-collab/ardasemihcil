import { generateGeminiText } from "@/lib/ai/geminiClient";
import type {
  AiDiagnosis,
  AnomalyItem,
  ColumnContribution,
  OeeSummary,
  OptimizationSummary,
  ParsedCsvData,
} from "@/utils/processData";

type Input = {
  summary: OptimizationSummary;
  oeeSummary: OeeSummary;
  diagnosis: AiDiagnosis;
  contributions: ColumnContribution[];
  anomalies: AnomalyItem[];
  parsedCsv: ParsedCsvData;
};

const buildPrompt = (input: Input): string => {
  const sampleRows = input.parsedCsv.rows.slice(0, 4);

  return [
    "Sen enerji verimliligi egitmeni ve muhendislik hesap uzmanisin.",
    "Asagidaki CSV analizina gore, kitap ornekleri gibi uygulamali sorular uret.",
    "Sadece CSV'den anlamli olacak sayisal sorular yaz.",
    "Toplam 3 soru uret ve her soru icin adim adim cozum ver.",
    "Cevabi yalnizca Markdown ver.",
    "Zorunlu format:",
    "## Ornek Soru 1",
    "### Soru",
    "### Cozum",
    "1. ...",
    "2. ...",
    "### Sonuc",
    "Ayni yapi Ornek Soru 2 ve Ornek Soru 3 icin de tekrar edilmeli.",
    "Kullanim kurali:",
    "- Cozumde formul acikca yazilmali.",
    "- Birimler acik yazilmali.",
    "- Sayisal ara adimlar gosterilmeli.",
    "- Soru ve cozumler isletme diliyle profesyonel olmali.",
    "- Gereksiz uzun teoriden kacinin.",
    "Veri baglami:",
    JSON.stringify(
      {
        summary: input.summary,
        oeeSummary: input.oeeSummary,
        diagnosis: input.diagnosis,
        topContributions: input.contributions.slice(0, 5),
        anomalies: input.anomalies,
        headers: input.parsedCsv.headers,
        sampleRows,
      },
      null,
      2
    ),
  ].join("\n");
};

export const generatePracticeProblems = async (input: Input): Promise<string> => {
  const { text } = await generateGeminiText({
    prompt: buildPrompt(input),
    temperature: 0.2,
    maxOutputTokens: 1400,
    timeoutMs: 35000,
  });

  return text;
};
