export type QueueStatus = "queued" | "processing" | "completed" | "failed";

export type UValueSource = "manual" | "csv" | "filename" | "missing";

export type MonthlyPoint = {
  label: string;
  heatingGas: number;
  coolingElectricity: number;
  systemFans: number;
  systemPumps: number;
  airTemp: number;
  operativeTemp: number;
  outsideTemp: number;
};

export type ParsedDesignBuilderCsv = {
  months: MonthlyPoint[];
  detectedUValue: number | null;
  detectedUValueSource: Extract<UValueSource, "csv" | "filename"> | null;
  sourceNotes: string[];
};

export type DesignBuilderReport = {
  id: string;
  fileName: string;
  uValue: number | null;
  uValueSource: UValueSource;
  sourceNotes: string[];
  months: MonthlyPoint[];
  totalHeatingGas: number;
  totalCoolingElectricity: number;
  totalFans: number;
  totalPumps: number;
  totalParasiticEnergy: number;
  hvacTotal: number;
  totalSystemEnergy: number;
  avgAirTemp: number;
  avgOperativeTemp: number;
  avgOutsideTemp: number;
  comfortPenalty: number;
  comfortBandRate: number;
  comfortRiskMonths: string[];
  temperatureSwing: number;
  peakHeatingMonth: string | null;
  peakCoolingMonth: string | null;
  heatingShare: number;
  coolingShare: number;
};

export type RankedReport = DesignBuilderReport & {
  finalScore: number;
  scoreBreakdown: {
    systemEnergy: number;
    comfortPenalty: number;
    comfortBandGap: number;
    temperatureSwing: number;
    uValue: number;
  };
};

export type DesignBuilderTrendPoint = {
  fileName: string;
  uValue: number;
  finalScore: number;
  hvacTotal: number;
  totalSystemEnergy: number;
  comfortBandRate: number;
};

export type DesignBuilderMonthlyDelta = {
  label: string;
  heatingDelta: number;
  coolingDelta: number;
  hvacDelta: number;
  systemEnergyDelta: number;
  operativeTempDelta: number;
};

export type DesignBuilderRecommendation = {
  recommendedUValue: number | null;
  winnerId: string;
  winnerFileName: string;
  referenceId: string;
  referenceFileName: string;
  confidenceScore: number;
  confidenceLabel: "low" | "medium" | "high";
  savingsVsReference: number;
  savingsVsReferencePct: number;
  hvacSavingsVsReference: number;
  hvacSavingsVsReferencePct: number;
  comfortDeltaVsReference: number;
  trendDirection: "lower_is_better" | "higher_is_better" | "mixed" | "insufficient";
  testedRange: [number, number] | null;
  candidateRange: [number, number] | null;
  reasonSummary: string;
  reasons: string[];
  watchouts: string[];
};

export type DesignBuilderInsightPayload = {
  generatedAt: string;
  scenarioCount: number;
  winner: RankedReport | null;
  reference: RankedReport | null;
  recommendation: DesignBuilderRecommendation | null;
  trendPoints: DesignBuilderTrendPoint[];
  monthlyDeltas: DesignBuilderMonthlyDelta[];
  biggestSavingsMonth: DesignBuilderMonthlyDelta | null;
  biggestPenaltyMonth: DesignBuilderMonthlyDelta | null;
};
