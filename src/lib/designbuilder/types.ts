export type QueueStatus = "queued" | "processing" | "completed" | "failed";

export type UValueSource = "manual" | "detected" | "filename" | "missing";

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
  hvacTotal: number;
  avgAirTemp: number;
  avgOperativeTemp: number;
  avgOutsideTemp: number;
  comfortPenalty: number;
};

export type RankedReport = DesignBuilderReport & {
  finalScore: number;
  scoreBreakdown: {
    hvac: number;
    parasitic: number;
    comfort: number;
    uValue: number;
  };
};
