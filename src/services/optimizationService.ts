import { generateLlmText } from "@/lib/ai/llmClient";
import { STRATEGIST_SYSTEM_PROMPT } from "@/constants/prompts";
import type { ScenarioSummaryPayload } from "@/services/aiOrchestrator";
import { REPORT_SECTION_DEFINITIONS, type ReportSectionKey } from "@/types/report";

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
  reportExcerpt: string | null;
  latexTableRow: string;
  explanation: string[];
};

export type CurrencyConfig = {
  code: "USD" | "TRY" | "EUR";
  symbol: string;
  electricityRatePerKwh: number;
  carbonCostPerKg: number;
};

export const CURRENCY_PRESETS: Record<string, CurrencyConfig> = {
  USD: {
    code: "USD",
    symbol: "$",
    electricityRatePerKwh: 0.12,
    carbonCostPerKg: 0.025,
  },
  TRY: {
    code: "TRY",
    symbol: "₺",
    electricityRatePerKwh: 2.85,
    carbonCostPerKg: 0.75,
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    electricityRatePerKwh: 0.18,
    carbonCostPerKg: 0.035,
  },
};

export type OptimizationComparisonResult = {
  baselineScenarioId: string;
  winner: OptimizationScenarioDossier;
  scenarios: OptimizationScenarioDossier[];
  sectionWinners: OptimizationSectionWinner[];
  latexTable: string;
  strategistSummary: string;
  currency: CurrencyConfig;
};

export type OptimizationSectionWinner = {
  sectionKey: ReportSectionKey;
  sectionTitle: string;
  winnerScenarioId: string;
  winnerScenarioName: string;
  reason: string;
  score: number;
};

const CARBON_FACTOR_KG_PER_KWH = 0.42;

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
      ? "Kararı sadece ham metriklerden değil, her senaryo için üretilmiş teknik rapor özetlerinden de kanıt alarak ver."
      : "Base the decision not only on raw metrics, but also on the generated technical report excerpts for each scenario.",
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

const buildSectionWinners = (
  dossiers: OptimizationScenarioDossier[],
  sourceScenarios: Array<{ summary: ScenarioSummaryPayload; costEstimate: number | null; reportMarkdown?: string | null }>,
  currency: CurrencyConfig
): OptimizationSectionWinner[] => {
  const summaryById = new Map(sourceScenarios.map((item) => [item.summary.scenario.id, item.summary]));

  const scoreBySection = (sectionKey: ReportSectionKey, dossier: OptimizationScenarioDossier) => {
    const summary = summaryById.get(dossier.scenarioId)?.summary;
    const anomalies = summary?.detectedAnomalies.length ?? 0;
    const heating = summary?.metrics.heatingLoad.sum ?? dossier.annualEnergyKwh;
    const cooling = summary?.metrics.coolingLoad.sum ?? 0;
    const peakHeating = summary?.peaks.heating?.value ?? 0;
    const peakCooling = summary?.peaks.cooling?.value ?? 0;

    if (sectionKey === "methodology_and_data_quality") return Math.max(0, 100 - anomalies * 15 + Math.min((summary?.rowCount ?? 0) / 20, 10));
    if (sectionKey === "climate_and_boundary_conditions") return dossier.comfortScore - anomalies * 5;
    if (sectionKey === "envelope_analysis") return Math.max(0, 100 - Math.abs(heating) / 25000);
    if (sectionKey === "energy_profile") return dossier.intensityScore || Math.max(0, 100 - dossier.annualEnergyKwh / 50000);
    if (sectionKey === "peak_load_analysis") return Math.max(0, 100 - (Math.abs(peakHeating) + Math.abs(peakCooling)) / 15000);
    if (sectionKey === "carbon_and_cost") return dossier.carbonScore * 0.5 + dossier.roiScore * 0.5;
    if (sectionKey === "thermal_comfort") return dossier.comfortScore;
    if (sectionKey === "risk_and_anomalies") return Math.max(0, 100 - anomalies * 20 - (cooling < 0 ? 10 : 0));
    return dossier.finalScore;
  };

  return REPORT_SECTION_DEFINITIONS.map((section) => {
    const ranked = dossiers
      .map((dossier) => ({ dossier, score: scoreBySection(section.key, dossier) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const summary = summaryById.get(best.dossier.scenarioId)?.summary;
    const reasonMap: Record<ReportSectionKey, string> = {
      project_summary: `${best.dossier.scenarioName}, genel karar skorunda ${best.dossier.finalScore} ile en dengeli dosya oldugu icin one cikti.`,
      methodology_and_data_quality: `${best.dossier.scenarioName}, veri kalitesi riskleri ve okunabilir satir kapsaminda daha guvenilir gorundugu icin one cikti.`,
      climate_and_boundary_conditions: `${best.dossier.scenarioName}, iklim ve sinir kosulu yorumunu destekleyen konfor/duyarlilik skorunda daha iyi denge verdi.`,
      envelope_analysis: `${best.dossier.scenarioName}, isitma yuku baskisini daha dusuk tuttugu icin kabuk performansi tarafinda avantajli gorundu.`,
      energy_profile: `${best.dossier.scenarioName}, enerji profili ve yogunluk skoru acisindan daha iyi toplam performans gosterdi.`,
      peak_load_analysis: `${best.dossier.scenarioName}, pik yuk riski daha dusuk oldugu icin sistem kapasitesi acisindan daha guvenli secenek oldu.`,
      carbon_and_cost: `${best.dossier.scenarioName}, karbon ve isletme maliyeti dengesinde ${currency.symbol}${best.dossier.annualOpexEstimate} yillik maliyetle one cikti.`,
      thermal_comfort: `${best.dossier.scenarioName}, ${best.dossier.comfortScore}/100 konfor skoruyla bu bolumun galibi oldu.`,
      risk_and_anomalies: `${best.dossier.scenarioName}, ${summary?.detectedAnomalies.length ?? 0} anomali ile risk profilinde daha temiz okundu.`,
      optimization_conclusion: `${best.dossier.scenarioName}, tum kriterlerin agirlikli toplaminda en yuksek final skoru verdigi icin nihai secime en yakin dosya oldu.`,
    };

    return {
      sectionKey: section.key,
      sectionTitle: section.title,
      winnerScenarioId: best.dossier.scenarioId,
      winnerScenarioName: best.dossier.scenarioName,
      reason: reasonMap[section.key],
      score: round(best.score, 2),
    };
  });
};

export function aggregateScenarioOptimization(input: {
  scenarios: Array<{
    summary: ScenarioSummaryPayload;
    costEstimate: number | null;
    reportMarkdown?: string | null;
  }>;
  currency?: CurrencyConfig;
}) {
  if (input.scenarios.length < 2) {
    throw new Error("Karsilastirma icin en az iki scenario gerekli.");
  }

  const currency = input.currency ?? CURRENCY_PRESETS.TRY;

  // Baseline'ı CAPEX'in en düşük olduğu senaryo olarak seç (daha ekonomik başlangıç)
  const baseline = [...input.scenarios].sort(
    (a, b) => (a.costEstimate ?? 0) - (b.costEstimate ?? 0)
  )[0];
  const baselineScenarioId = baseline.summary.scenario.id;

  const floorAreas = input.scenarios
    .map((item) => {
      const area = item.summary.scenario.projectId ? null : null;
      const climate = item.summary.scenario as unknown as { floorArea?: number };
      return climate.floorArea ?? null;
    })
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item > 0);

  const fallbackArea = floorAreas.length > 0 ? floorAreas[0] : null;

  const raw = input.scenarios.map(({ summary, costEstimate, reportMarkdown }) => {
    const annualEnergyKwh = summary.scenario.totalEnergyConsumption ?? (summary.summary.metrics.heatingLoad.sum ?? 0) + (summary.summary.metrics.coolingLoad.sum ?? 0);
    const annualCarbonKg = annualEnergyKwh * CARBON_FACTOR_KG_PER_KWH;
    const annualCarbonCost = annualCarbonKg * currency.carbonCostPerKg;
    const annualOpexEstimate = (annualEnergyKwh * currency.electricityRatePerKwh) + annualCarbonCost;
    const capex = costEstimate ?? 0;
    
    const baselineEnergy = baseline.summary.scenario.totalEnergyConsumption ?? annualEnergyKwh;
    const baselineCapex = baseline.costEstimate ?? 0;
    const baselineOpex = (baselineEnergy * currency.electricityRatePerKwh) + (baselineEnergy * CARBON_FACTOR_KG_PER_KWH * currency.carbonCostPerKg);
    
    const deltaCapex = capex - baselineCapex;
    const annualSavings = baselineOpex - annualOpexEstimate;
    const roiYears = deltaCapex > 0 && annualSavings > 0 ? round(deltaCapex / annualSavings, 2) : (deltaCapex <= 0 ? 0 : null);
    
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
      roiYears,
      energyIntensity: energyIntensity !== null && Number.isFinite(energyIntensity) ? round(energyIntensity) : null,
      comfortScore,
      carbonScore: 0,
      roiScore: 0,
      intensityScore: 0,
      finalScore: 0,
      monthlyTrend,
      reportExcerpt: reportMarkdown ? reportMarkdown.replace(/\s+/g, " ").trim().slice(0, 1200) : null,
      latexTableRow: "",
      explanation: [],
    } satisfies OptimizationScenarioDossier;
  });

  const minCarbon = Math.min(...raw.map((item) => item.annualCarbonKg));
  const maxCarbon = Math.max(...raw.map((item) => item.annualCarbonKg));
  const minRoi = Math.min(...raw.map((item) => item.roiYears ?? 99));
  const maxRoi = Math.max(...raw.map((item) => item.roiYears ?? 99));
  const intensityValues = raw.map((item) => item.energyIntensity ?? Math.max(...raw.map((x) => x.annualEnergyKwh)));
  const minIntensity = Math.min(...intensityValues);
  const maxIntensity = Math.max(...intensityValues);

  const dossiers = raw.map((item) => {
    const carbonScore = normalizeInverse(item.annualCarbonKg, minCarbon, maxCarbon);
    const roiScore = item.roiYears !== null ? normalizeInverse(item.roiYears, minRoi, maxRoi) : 50;
    const intensityScore = item.energyIntensity !== null ? normalizeInverse(item.energyIntensity, minIntensity, maxIntensity) : 50;
    // Ağırlıklandırılmış skor: ROI 35%, Enerji Yoğunluğu 25%, Konfor 20%, Karbon 20%
    const finalScore = round(roiScore * 0.35 + intensityScore * 0.25 + item.comfortScore * 0.2 + carbonScore * 0.2, 3);
    const explanation = [
      `ROI: ${item.roiYears !== null ? (item.roiYears === 0 ? "Hemen (negatif capex)" : `${item.roiYears} yıl`) : "N/A"}`,
      `Enerji Yoğunluğu: ${item.energyIntensity !== null ? item.energyIntensity : "-"} kWh/m²`,
      `Konfor Skoru: ${item.comfortScore}/100`,
      `Karbon: ${item.annualCarbonKg} kgCO₂/yıl`,
      `Yıllık Maliyet (${currency.code}): ${currency.symbol}${item.annualOpexEstimate}`,
    ];
    return {
      ...item,
      carbonScore,
      roiScore,
      intensityScore,
      finalScore,
      latexTableRow: `${item.scenarioName} & ${item.annualEnergyKwh} & ${currency.symbol}${item.capex} & ${item.annualCarbonKg} & ${item.roiYears ?? "-"} & ${item.comfortScore} & ${finalScore} \\\\`,
      explanation,
    };
  });

  return {
    baselineScenarioId,
    dossiers: dossiers.sort((a, b) => b.finalScore - a.finalScore),
  };
}

export async function buildOptimizationDecision(input: {
  scenarios: Array<{
    summary: ScenarioSummaryPayload;
    costEstimate: number | null;
    reportMarkdown?: string | null;
  }>;
  language: "tr" | "en";
  currency?: CurrencyConfig;
}): Promise<OptimizationComparisonResult> {
  const currency = input.currency ?? CURRENCY_PRESETS.TRY;
  const { baselineScenarioId, dossiers: scenarios } = aggregateScenarioOptimization({ scenarios: input.scenarios, currency });
  const winner = scenarios[0];
  const latexTable = buildLatexTable(scenarios);
  const sectionWinners = buildSectionWinners(scenarios, input.scenarios, currency);
  const fallbackSummary =
    input.language === "tr"
      ? [
          `${winner.scenarioName} en yuksek toplam verimlilik skorunu aldi (${winner.finalScore}).`,
          `Bolum bazli incelemede ${sectionWinners.filter((item) => item.winnerScenarioId === winner.scenarioId).length}/${sectionWinners.length} baslikta one cikti.`,
          `Yillik enerji tuketimi ${winner.annualEnergyKwh} kWh, karbon etkisi ${winner.annualCarbonKg} kgCO2/yil.`,
          `Yillik isletme maliyeti ${currency.symbol}${winner.annualOpexEstimate} (${currency.code}), ${winner.roiYears ? `kapital geri donusum suresi ${winner.roiYears} yil` : "hemen kari"}.`,
          `Karar: ROI (%35), enerji yogunlugu (%25), konfor (%20) ve karbon (%20) oranlarinda degerlendirilmistir.`,
        ].join(" ")
      : [
          `${winner.scenarioName} achieved the highest combined efficiency score (${winner.finalScore}).`,
          `Its annual energy use is ${winner.annualEnergyKwh} kWh and annual carbon impact is ${winner.annualCarbonKg} kgCO2/year.`,
          `Annual operating cost is ${currency.symbol}${winner.annualOpexEstimate} (${currency.code}), with a payback period of ${winner.roiYears ? `${winner.roiYears} years` : "immediate payback"}.`,
          "The decision is based on weighted scoring: ROI (35%), energy intensity (25%), comfort (20%), and carbon (20%).",
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
    baselineScenarioId,
    winner,
    scenarios,
    sectionWinners,
    latexTable,
    strategistSummary,
    currency,
  };
}
