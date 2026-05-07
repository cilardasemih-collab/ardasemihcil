import type {
  DesignBuilderInsightPayload,
  DesignBuilderMonthlyDelta,
  DesignBuilderRecommendation,
  DesignBuilderTrendPoint,
  RankedReport,
} from "@/lib/designbuilder/types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const numberFmt = (value: number, maximumFractionDigits = 2) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits }).format(value);

const percentFmt = (value: number, maximumFractionDigits = 1) =>
  new Intl.NumberFormat("tr-TR", {
    style: "percent",
    maximumFractionDigits,
  }).format(value);

const toPercentDelta = (current: number, reference: number) => {
  if (reference <= 0) return 0;
  return ((current - reference) / reference) * 100;
};

const buildTrendPoints = (ranking: RankedReport[]): DesignBuilderTrendPoint[] => {
  return ranking
    .filter((item): item is RankedReport & { uValue: number } => item.uValue !== null)
    .map((item) => ({
      fileName: item.fileName,
      uValue: item.uValue,
      finalScore: item.finalScore,
      hvacTotal: item.hvacTotal,
      totalSystemEnergy: item.totalSystemEnergy,
      comfortBandRate: item.comfortBandRate,
    }))
    .sort((a, b) => a.uValue - b.uValue);
};

const detectTrendDirection = (trendPoints: DesignBuilderTrendPoint[]): DesignBuilderRecommendation["trendDirection"] => {
  if (trendPoints.length < 2) return "insufficient";

  let lowerIsBetter = 0;
  let higherIsBetter = 0;

  for (let index = 1; index < trendPoints.length; index += 1) {
    const prev = trendPoints[index - 1];
    const next = trendPoints[index];
    const energyDelta = next.totalSystemEnergy - prev.totalSystemEnergy;

    if (energyDelta > 0) {
      lowerIsBetter += 1;
    } else if (energyDelta < 0) {
      higherIsBetter += 1;
    }
  }

  if (lowerIsBetter > 0 && higherIsBetter === 0) return "lower_is_better";
  if (higherIsBetter > 0 && lowerIsBetter === 0) return "higher_is_better";
  return "mixed";
};

const confidenceLabelFromScore = (score: number): DesignBuilderRecommendation["confidenceLabel"] => {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
};

const buildMonthlyDeltas = (winner: RankedReport | null, reference: RankedReport | null): DesignBuilderMonthlyDelta[] => {
  if (!winner || !reference) return [];

  const referenceMonths = new Map(reference.months.map((month) => [month.label, month]));
  const deltas: DesignBuilderMonthlyDelta[] = [];

  for (const current of winner.months) {
    const base = referenceMonths.get(current.label);
    if (!base) continue;
    const winnerSystem = current.heatingGas + current.coolingElectricity + current.systemFans + current.systemPumps;
    const referenceSystem = base.heatingGas + base.coolingElectricity + base.systemFans + base.systemPumps;

    deltas.push({
      label: current.label || base.label,
      heatingDelta: current.heatingGas - base.heatingGas,
      coolingDelta: current.coolingElectricity - base.coolingElectricity,
      hvacDelta: current.heatingGas + current.coolingElectricity - (base.heatingGas + base.coolingElectricity),
      systemEnergyDelta: winnerSystem - referenceSystem,
      operativeTempDelta: current.operativeTemp - base.operativeTemp,
    });
  }

  return deltas;
};

const buildRecommendation = (ranking: RankedReport[]): DesignBuilderRecommendation | null => {
  if (ranking.length === 0) return null;

  const winner = ranking[0];
  const reference = ranking[ranking.length - 1];
  const runnerUp = ranking[1] ?? null;
  const trendPoints = buildTrendPoints(ranking);
  const trendDirection = detectTrendDirection(trendPoints);
  const knownUValues = trendPoints.map((item) => item.uValue);
  const testedRange =
    knownUValues.length > 0 ? [Math.min(...knownUValues), Math.max(...knownUValues)] as [number, number] : null;

  const marginToRunnerUp =
    runnerUp && runnerUp.finalScore > 0 ? ((runnerUp.finalScore - winner.finalScore) / runnerUp.finalScore) * 100 : 0;
  const uCoverage = ranking.length > 0 ? trendPoints.length / ranking.length : 0;
  const scenarioCoverageScore = Math.min(30, ranking.length * 8);
  const uCoverageScore = uCoverage * 25;
  const winnerKnownScore = winner.uValue !== null ? 10 : 0;
  const trendScore =
    trendDirection === "mixed" || trendDirection === "insufficient"
      ? 8
      : 20;
  const separationScore = clamp(marginToRunnerUp * 3, 0, 15);
  const confidenceScore = Math.round(
    clamp(scenarioCoverageScore + uCoverageScore + winnerKnownScore + trendScore + separationScore, 15, 96)
  );
  const confidenceLabel = confidenceLabelFromScore(confidenceScore);

  const savingsVsReference = reference.totalSystemEnergy - winner.totalSystemEnergy;
  const hvacSavingsVsReference = reference.hvacTotal - winner.hvacTotal;
  const comfortDeltaVsReference = winner.comfortBandRate - reference.comfortBandRate;

  const reasons: string[] = [
    `${winner.fileName} en dusuk nihai skora sahip ve toplam sistem enerjisinde ${numberFmt(
      savingsVsReference
    )} kWh iyilesme sagliyor.`,
    `HVAC toplami referans senaryoya gore %{numberFmt(Math.max(0, -toPercentDelta(winner.hvacTotal, reference.hvacTotal)), 2)} daha dusuk.`,
    `Konfor bandinda kalma orani ${percentFmt(winner.comfortBandRate)} seviyesinde.`,
  ];

  if (winner.uValue !== null) {
    reasons.unshift(`En guclu aday senaryonun U degeri ${numberFmt(winner.uValue, 3)} olarak gorunuyor.`);
  }

  if (runnerUp) {
    reasons.push(
      `${runnerUp.fileName} ikinci sirada; aradaki skor farki ${numberFmt(
        runnerUp.finalScore - winner.finalScore,
        4
      )}.`
    );
  }

  const watchouts: string[] = [];
  if (winner.uValue === null) {
    watchouts.push("Kazanan senaryoda U degeri dogrudan tespit edilemedi; manuel eslestirme yapilirsa karar daha guvenilir olur.");
  }
  if (trendDirection === "mixed") {
    watchouts.push("Test edilen U degerleri ile enerji sonucu arasinda tam monoton bir trend yok; kazanan senaryoyu ek ara U denemeleriyle dogrulamak faydali olur.");
  }
  if (winner.comfortRiskMonths.length > 0) {
    watchouts.push(`Konfor riski gozlenen aylar: ${winner.comfortRiskMonths.join(", ")}.`);
  }
  if (Math.abs(comfortDeltaVsReference) < 0.02) {
    watchouts.push("Konfor farki sinirli; karari saglamlastirmak icin maliyet ve yogusma kontroluyle birlikte degerlendirmek gerekir.");
  }

  const candidateRange: [number, number] | null =
    winner.uValue !== null && runnerUp?.uValue !== null
      ? [Math.min(winner.uValue, runnerUp.uValue), Math.max(winner.uValue, runnerUp.uValue)]
      : winner.uValue !== null
        ? [winner.uValue, winner.uValue]
        : null;

  const reasonSummary =
    winner.uValue !== null
      ? `Onerilen U degeri ${numberFmt(winner.uValue, 3)}. Bu senaryo referansa gore toplam sistem enerjisinde %{numberFmt(
          Math.max(0, ((reference.totalSystemEnergy - winner.totalSystemEnergy) / Math.max(reference.totalSystemEnergy, 1)) * 100),
          2
        )} iyilesme sagliyor.`
      : `${winner.fileName} en iyi senaryo olarak one cikiyor ancak net U degeri eksik.`;

  return {
    recommendedUValue: winner.uValue,
    winnerId: winner.id,
    winnerFileName: winner.fileName,
    referenceId: reference.id,
    referenceFileName: reference.fileName,
    confidenceScore,
    confidenceLabel,
    savingsVsReference,
    savingsVsReferencePct: Math.max(0, -toPercentDelta(winner.totalSystemEnergy, reference.totalSystemEnergy)),
    hvacSavingsVsReference,
    hvacSavingsVsReferencePct: Math.max(0, -toPercentDelta(winner.hvacTotal, reference.hvacTotal)),
    comfortDeltaVsReference,
    trendDirection,
    testedRange,
    candidateRange,
    reasonSummary,
    reasons,
    watchouts,
  };
};

export function buildDesignBuilderInsightPayload(ranking: RankedReport[]): DesignBuilderInsightPayload {
  const winner = ranking[0] ?? null;
  const reference = ranking[ranking.length - 1] ?? null;
  const recommendation = buildRecommendation(ranking);
  const monthlyDeltas = buildMonthlyDeltas(winner, reference);

  const biggestSavingsMonth =
    monthlyDeltas.length > 0
      ? monthlyDeltas.reduce((best, item) => (item.systemEnergyDelta < best.systemEnergyDelta ? item : best), monthlyDeltas[0])
      : null;
  const biggestPenaltyMonth =
    monthlyDeltas.length > 0
      ? monthlyDeltas.reduce((worst, item) => (item.systemEnergyDelta > worst.systemEnergyDelta ? item : worst), monthlyDeltas[0])
      : null;

  return {
    generatedAt: new Date().toISOString(),
    scenarioCount: ranking.length,
    winner,
    reference,
    recommendation,
    trendPoints: buildTrendPoints(ranking),
    monthlyDeltas,
    biggestSavingsMonth,
    biggestPenaltyMonth,
  };
}

export function buildDesignBuilderActionPlan(payload: DesignBuilderInsightPayload): string[] {
  const recommendation = payload.recommendation;
  if (!recommendation || !payload.winner || !payload.reference) return [];

  const actions = [
    recommendation.recommendedUValue !== null
      ? `Onerilen U degeri olan ${numberFmt(recommendation.recommendedUValue, 3)} etrafinda en az 2 ara senaryo daha kostur ve egriyi dogrula.`
      : `Kazanan senaryonun U degerini dosya adi veya manuel eslestirme ile netlestir; aksi halde karar kaynağa baglanamaz.`,
    `Kazanan senaryoyu referans senaryoya gore aylik bazda incele; ozellikle ${payload.biggestSavingsMonth?.label ?? "en kritik ay"} icin enerji farkini tasarim kararina bagla.`,
    `Yogusma, maliyet ve uygulama kalinligi kontrolu yaparak sadece enerji degil uygulanabilirlik filtresi de ekle.`,
  ];

  if (payload.winner.comfortRiskMonths.length > 0) {
    actions.push(`Konfor riski olan aylar (${payload.winner.comfortRiskMonths.join(", ")}) icin setpoint ve havalandirma etkisini ikinci tur simulasyonda ayir.`);
  }

  if (recommendation.trendDirection === "mixed") {
    actions.push("U degeri ile enerji sonucu arasinda karisik trend oldugu icin mesh, infiltrasyon ve cam kazanci varsayimlarini yeniden dogrula.");
  }

  return actions;
}

export function buildDesignBuilderFallbackMarkdown(payload: DesignBuilderInsightPayload): string {
  const winner = payload.winner;
  const reference = payload.reference;
  const recommendation = payload.recommendation;

  if (!winner || !reference || !recommendation) {
    return "## Teknik Rapor\nDesignBuilder karsilastirma raporu icin yeterli senaryo bulunamadi.";
  }

  const lines = [
    "## 1. Onerilen U Degeri",
    recommendation.recommendedUValue !== null
      ? `Onerilen U degeri **${numberFmt(recommendation.recommendedUValue, 3)}** olarak gorunuyor. Guven seviyesi **${recommendation.confidenceLabel}** (${recommendation.confidenceScore}/100).`
      : `Kazanan senaryo **${winner.fileName}** olsa da U degeri otomatik tespit edilemedi. Manuel eslestirme onerilir.`,
    "",
    "## 2. Enerji ve Sistem Davranisi",
    `Kazanan senaryo **${winner.fileName}**, referans olarak alinan **${reference.fileName}** senaryosuna gore toplam sistem enerjisinde **${numberFmt(
      recommendation.savingsVsReference
    )} kWh** tasarruf sagliyor.`,
    `HVAC yukunde iyilesme **%${numberFmt(recommendation.hvacSavingsVsReferencePct, 2)}**, toplam sistem enerjisinde iyilesme **%${numberFmt(
      recommendation.savingsVsReferencePct,
      2
    )}** seviyesinde.`,
    winner.peakHeatingMonth ? `Isitma zirvesi ${winner.peakHeatingMonth}, sogutma zirvesi ${winner.peakCoolingMonth ?? "-"}.` : "",
    "",
    "## 3. Termal Konfor ve Riskler",
    `Kazanan senaryonun konfor bandinda kalma orani **${percentFmt(winner.comfortBandRate)}**. Referansa gore fark **%${numberFmt(
      recommendation.comfortDeltaVsReference * 100,
      2
    )}** puan.`,
    winner.comfortRiskMonths.length > 0
      ? `Riskli aylar: ${winner.comfortRiskMonths.join(", ")}. Bu aylar icin zarf karari, havalandirma ve setpoint birlikte okunmali.`
      : "Mevcut veri setinde ciddi bir konfor riski ay bazinda gorunmuyor.",
    "",
    "## 4. Teknik Karar ve Sonraki Adim",
    ...recommendation.reasons.map((item) => `- ${item}`),
    ...recommendation.watchouts.map((item) => `- Dikkat: ${item}`),
  ].filter(Boolean);

  return lines.join("\n");
}
