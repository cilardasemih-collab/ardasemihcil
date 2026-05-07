import { generateLlmText } from "@/lib/ai/llmClient";
import { STRATEGIST_SYSTEM_PROMPT } from "@/constants/prompts";
import type { ScenarioSummaryPayload } from "@/services/aiOrchestrator";

export type OptimizationScenarioDossier = {
  scenarioId: string;
  scenarioName: string;
  projectId: string | null;
  projectName: string;
  location: string | null;
  annualEnergyKwh: number;
  annualCarbonKg: number;
  annualOpexEstimate: number;
  capex: number;
  roiYears: number | null;
  energyIntensity: number | null;
  comfortScore: number;
  carbonScore: number;
  roiScore: number;
  intensityScore: number;
  finalScore: number;
  monthlyTrend: Array<{
    label: string;
    heating: number;
    cooling: number;
    total: number;
  }>;
  latexTableRow: string;
  explanation: string[];
};

export type OptimizationComparisonResult = {
  baselineScenarioId: string;
  winner: OptimizationScenarioDossier;
  scenarios: OptimizationScenarioDossier[];
  latexTable: string;
  strategistSummary: string;
};

const CARBON_FACTOR_KG_PER_KWH = 0.42;
const ELECTRICITY_COST_PER_KWH = 0.12;

const round = (value: number, digits = 3) => Number(value.toFixed(digits));

const normalizeInverse = (value: number, min: number, max: number) => {
  if (max - min <= 0) return 100;
  return round(((max - value) / (max - min)) * 100, 2);
};

const computeComfortPenalty = (summary: ScenarioSummaryPayload["summary"]) => {
  const tempAvg = summary.metrics.airTemperature.avg ?? 22;
  const humidityAvg = summary.metrics.humidity.avg ?? 50;
  const anomalyPenalty = summary.detectedAnomalies.length * 6;
  const tempPenalty = tempAvg < 20 ? (20 - tempAvg) * 8 : tempAvg > 26 ? (tempAvg - 26) * 8 : 0;
  const humidityPenalty = humidityAvg < 30 ? (30 - humidityAvg) * 0.8 : humidityAvg > 65 ? (humidityAvg - 65) * 0.8 : 0;
  return tempPenalty + humidityPenalty + anomalyPenalty;
};

const monthlyTrendFromSummary = (summary: ScenarioSummaryPayload["summary"]) => {
  const heatingPeak = summary.peaks.heating?.value ?? 0;
  const coolingPeak = summary.peaks.cooling?.value ?? 0;
  const annualHeating = summary.metrics.heatingLoad.sum ?? 0;
  const annualCooling = summary.metrics.coolingLoad.sum ?? 0;
  const labels = ["Q1", "Q2", "Q3", "Q4"];

  return labels.map((label, index) => {
    const heatingShare = index === 0 || index === 3 ? 0.32 : 0.18;
    const coolingShare = index === 1 || index === 2 ? 0.31 : 0.19;
    const heating = round(Math.max(heatingPeak * 0.35, annualHeating * heatingShare));
    const cooling = round(Math.max(coolingPeak * 0.35, annualCooling * coolingShare));
    return {
      label,
      heating,
      cooling,
      total: round(heating + cooling),
    };
  });
};

const buildLatexTable = (dossiers: OptimizationScenarioDossier[]) => {
  const lines = [
    "\\begin{array}{lrrrrrr}",
    "\\text{Scenario} & \\text{Energy} & \\text{CAPEX} & \\text{Carbon} & \\text{ROI} & \\text{Comfort} & \\text{Score} \\\\",
    ...dossiers.map((item) => item.latexTableRow),
    "\\end{array}",
  ];
  return lines.join("\n");
};

const buildStrategistPrompt = (dossiers: OptimizationScenarioDossier[], latexTable: string, language: "tr" | "en") => {
  return [
    language === "tr"
      ? "Aşağıdaki senaryo künyelerini kıyasla ve en iyi senaryoyu seç."
      : "Compare the following scenario dossiers and select the best scenario.",
    language === "tr"
      ? "Yanıtında teknik, ekonomik, karbon ve konfor açısından neden bu senaryonun seçildiğini açıkla."
      : "Explain why the chosen scenario wins from technical, economic, carbon, and comfort perspectives.",
    language === "tr"
      ? "Kısa bir final karar özeti ve kritik trade-off listesi üret."
      : "Produce a concise final decision summary and a list of key tradeoffs.",
    "Scenario dossiers:",
    JSON.stringify(dossiers, null, 2),
    "LaTeX comparison table:",
    latexTable,
  ].join("\n\n");
};

export function aggregateScenarioOptimization(input: {
  scenarios: Array<{
    summary: ScenarioSummaryPayload;
    costEstimate: number | null;
  }>;
}) {
  if (input.scenarios.length < 2) {
    throw new Error("Karsilastirma icin en az iki scenario gerekli.");
  }

  const baseline = [...input.scenarios].sort(
    (a, b) => (b.summary.scenario.totalEnergyConsumption ?? 0) - (a.summary.scenario.totalEnergyConsumption ?? 0)
  )[0];

  const floorAreas = input.scenarios
    .map((item) => {
      const area = item.summary.scenario.projectId ? null : null;
      const climate = item.summary.scenario as unknown as { floorArea?: number };
      return climate.floorArea ?? null;
    })
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item > 0);

  const fallbackArea = floorAreas.length > 0 ? floorAreas[0] : null;

  const raw = input.scenarios.map(({ summary, costEstimate }) => {
    const annualEnergyKwh = summary.scenario.totalEnergyConsumption ?? (summary.summary.metrics.heatingLoad.sum ?? 0) + (summary.summary.metrics.coolingLoad.sum ?? 0);
    const annualCarbonKg = annualEnergyKwh * CARBON_FACTOR_KG_PER_KWH;
    const annualOpexEstimate = annualEnergyKwh * ELECTRICITY_COST_PER_KWH;
    const capex = costEstimate ?? 0;
    const baselineEnergy = baseline.summary.scenario.totalEnergyConsumption ?? annualEnergyKwh;
    const deltaCapex = Math.max(0, capex - (baseline.costEstimate ?? 0));
    const deltaOpex = Math.max(annualOpexEstimate, (baselineEnergy - annualEnergyKwh) * ELECTRICITY_COST_PER_KWH);
    const roiYears = deltaOpex > 0 ? deltaCapex / deltaOpex : null;
    const comfortPenalty = computeComfortPenalty(summary.summary);
    const comfortScore = Math.max(0, round(100 - comfortPenalty, 2));
    const energyIntensity = fallbackArea && fallbackArea > 0 ? annualEnergyKwh / fallbackArea : null;
    const monthlyTrend = monthlyTrendFromSummary(summary.summary);

    return {
      scenarioId: summary.scenario.id,
      scenarioName: summary.scenario.name,
      projectId: summary.scenario.projectId ?? null,
      projectName: summary.scenario.projectName,
      location: summary.scenario.location,
      annualEnergyKwh: round(annualEnergyKwh),
      annualCarbonKg: round(annualCarbonKg),
      annualOpexEstimate: round(annualOpexEstimate),
      capex: round(capex),
      roiYears: roiYears !== null && Number.isFinite(roiYears) ? round(roiYears) : null,
      energyIntensity: energyIntensity !== null && Number.isFinite(energyIntensity) ? round(energyIntensity) : null,
      comfortScore,
      carbonScore: 0,
      roiScore: 0,
      intensityScore: 0,
      finalScore: 0,
      monthlyTrend,
      latexTableRow: "",
      explanation: [],
    } satisfies OptimizationScenarioDossier;
  });

  const minCarbon = Math.min(...raw.map((item) => item.annualCarbonKg));
  const maxCarbon = Math.max(...raw.map((item) => item.annualCarbonKg));
  const roiValues = raw.map((item) => item.roiYears ?? 99);
  const minRoi = Math.min(...roiValues);
  const maxRoi = Math.max(...roiValues);
  const intensityValues = raw.map((item) => item.energyIntensity ?? Math.max(...raw.map((x) => x.annualEnergyKwh)));
  const minIntensity = Math.min(...intensityValues);
  const maxIntensity = Math.max(...intensityValues);

  const dossiers = raw.map((item) => {
    const carbonScore = normalizeInverse(item.annualCarbonKg, minCarbon, maxCarbon);
    const roiScore = normalizeInverse(item.roiYears ?? maxRoi, minRoi, maxRoi);
    const intensityScore = normalizeInverse(item.energyIntensity ?? maxIntensity, minIntensity, maxIntensity);
    const finalScore = round(roiScore * 0.28 + intensityScore * 0.24 + item.comfortScore * 0.24 + carbonScore * 0.24, 3);
    const explanation = [
      `ROI: ${item.roiYears !== null ? item.roiYears : "-"} yil`,
      `Enerji Yogunlugu: ${item.energyIntensity !== null ? item.energyIntensity : "-"} kWh/m^2`,
      `Konfor Skoru: ${item.comfortScore}/100`,
      `Karbon: ${item.annualCarbonKg} kgCO2/yil`,
    ];
    return {
      ...item,
      carbonScore,
      roiScore,
      intensityScore,
      finalScore,
      latexTableRow: `${item.scenarioName} & ${item.annualEnergyKwh} & ${item.capex} & ${item.annualCarbonKg} & ${item.roiYears ?? "-"} & ${item.comfortScore} & ${finalScore} \\\\`,
      explanation,
    };
  });

  return dossiers.sort((a, b) => b.finalScore - a.finalScore);
}

export async function buildOptimizationDecision(input: {
  scenarios: Array<{
    summary: ScenarioSummaryPayload;
    costEstimate: number | null;
  }>;
  language: "tr" | "en";
}) : Promise<OptimizationComparisonResult> {
  const scenarios = aggregateScenarioOptimization(input);
  const winner = scenarios[0];
  const latexTable = buildLatexTable(scenarios);
  const fallbackSummary =
    input.language === "tr"
      ? [
          `${winner.scenarioName} en yuksek toplam verimlilik skorunu aldi (${winner.finalScore}).`,
          `Yillik enerji tuketimi ${winner.annualEnergyKwh} kWh, karbon etkisi ${winner.annualCarbonKg} kgCO2/yil seviyesinde.`,
          `Karar; ROI, enerji yogunlugu, konfor ve karbon agirliklarinin birlikte degerlendirilmesine dayaniyor.`,
        ].join(" ")
      : [
          `${winner.scenarioName} achieved the highest combined efficiency score (${winner.finalScore}).`,
          `Its annual energy use is ${winner.annualEnergyKwh} kWh and annual carbon impact is ${winner.annualCarbonKg} kgCO2/year.`,
          "The decision is based on the combined weighting of ROI, energy intensity, comfort, and carbon metrics.",
        ].join(" ");

  let strategistSummary = fallbackSummary;
  try {
    const strategist = await generateLlmText({
      systemPrompt: STRATEGIST_SYSTEM_PROMPT,
      userPrompt: buildStrategistPrompt(scenarios, latexTable, input.language),
      temperature: 0.2,
      maxOutputTokens: 1800,
      timeoutMs: 45000,
    });
    strategistSummary = strategist.text.trim() || fallbackSummary;
  } catch {
    strategistSummary = fallbackSummary;
  }

  return {
    baselineScenarioId: scenarios[scenarios.length - 1].scenarioId,
    winner,
    scenarios,
    latexTable,
    strategistSummary,
  };
}
