import type { DesignBuilderReport, RankedReport, UValueSource } from "@/lib/designbuilder/types";

const avg = (items: number[]) => {
  if (items.length === 0) return 0;
  return items.reduce((sum, item) => sum + item, 0) / items.length;
};

const normalize = (value: number, min: number, max: number) => {
  if (max - min <= 0) return 0;
  return (value - min) / (max - min);
};

const detectUValueSource = (
  manualU: number | null,
  detectedU: number | null,
  detectedSource: Extract<UValueSource, "csv" | "filename"> | null
): UValueSource => {
  if (manualU !== null) return "manual";
  if (detectedU !== null && detectedSource) return detectedSource;
  return "missing";
};

export function buildReport(input: {
  id: string;
  fileName: string;
  manualU: number | null;
  detectedU: number | null;
  detectedUValueSource: Extract<UValueSource, "csv" | "filename"> | null;
  sourceNotes: string[];
  months: DesignBuilderReport["months"];
}): DesignBuilderReport {
  const uValueSource = detectUValueSource(input.manualU, input.detectedU, input.detectedUValueSource);
  const uValue = input.manualU ?? input.detectedU;

  const totalHeatingGas = input.months.reduce((sum, row) => sum + row.heatingGas, 0);
  const totalCoolingElectricity = input.months.reduce((sum, row) => sum + row.coolingElectricity, 0);
  const totalFans = input.months.reduce((sum, row) => sum + row.systemFans, 0);
  const totalPumps = input.months.reduce((sum, row) => sum + row.systemPumps, 0);
  const totalParasiticEnergy = totalFans + totalPumps;
  const hvacTotal = totalHeatingGas + totalCoolingElectricity;
  const totalSystemEnergy = hvacTotal + totalParasiticEnergy;

  const avgAirTemp = avg(input.months.map((row) => row.airTemp));
  const avgOperativeTemp = avg(input.months.map((row) => row.operativeTemp));
  const avgOutsideTemp = avg(input.months.map((row) => row.outsideTemp));

  const comfortRiskMonths = input.months
    .filter((row) => row.operativeTemp < 20 || row.operativeTemp > 26)
    .map((row) => row.label);
  const comfortBandRate = input.months.length > 0 ? (input.months.length - comfortRiskMonths.length) / input.months.length : 0;

  const comfortPenalty = input.months.reduce((sum, row) => {
    if (row.operativeTemp < 20) return sum + (20 - row.operativeTemp) * 120;
    if (row.operativeTemp > 26) return sum + (row.operativeTemp - 26) * 120;
    return sum;
  }, 0);

  const operativeTemps = input.months.map((row) => row.operativeTemp);
  const temperatureSwing =
    operativeTemps.length > 0 ? Math.max(...operativeTemps) - Math.min(...operativeTemps) : 0;

  const peakHeatingMonth =
    input.months.length > 0
      ? input.months.reduce((peak, row) => (row.heatingGas > peak.heatingGas ? row : peak), input.months[0]).label
      : null;
  const peakCoolingMonth =
    input.months.length > 0
      ? input.months.reduce((peak, row) => (row.coolingElectricity > peak.coolingElectricity ? row : peak), input.months[0]).label
      : null;

  const heatingShare = hvacTotal > 0 ? totalHeatingGas / hvacTotal : 0;
  const coolingShare = hvacTotal > 0 ? totalCoolingElectricity / hvacTotal : 0;

  return {
    id: input.id,
    fileName: input.fileName,
    uValue: uValue ?? null,
    uValueSource,
    sourceNotes: input.sourceNotes,
    months: input.months,
    totalHeatingGas,
    totalCoolingElectricity,
    totalFans,
    totalPumps,
    totalParasiticEnergy,
    hvacTotal,
    totalSystemEnergy,
    avgAirTemp,
    avgOperativeTemp,
    avgOutsideTemp,
    comfortPenalty,
    comfortBandRate,
    comfortRiskMonths,
    temperatureSwing,
    peakHeatingMonth,
    peakCoolingMonth,
    heatingShare,
    coolingShare,
  };
}

export function rankReports(reports: DesignBuilderReport[]): RankedReport[] {
  if (reports.length === 0) return [];

  const systemValues = reports.map((item) => item.totalSystemEnergy);
  const comfortValues = reports.map((item) => item.comfortPenalty);
  const comfortBandGapValues = reports.map((item) => 1 - item.comfortBandRate);
  const swingValues = reports.map((item) => item.temperatureSwing);
  const uValues = reports.map((item) => item.uValue).filter((item): item is number => item !== null);

  const minSystem = Math.min(...systemValues);
  const maxSystem = Math.max(...systemValues);
  const minComfort = Math.min(...comfortValues);
  const maxComfort = Math.max(...comfortValues);
  const minComfortBandGap = Math.min(...comfortBandGapValues);
  const maxComfortBandGap = Math.max(...comfortBandGapValues);
  const minSwing = Math.min(...swingValues);
  const maxSwing = Math.max(...swingValues);
  const minU = uValues.length > 0 ? Math.min(...uValues) : 0;
  const maxU = uValues.length > 0 ? Math.max(...uValues) : 1;
  const fallbackU = uValues.length > 0 ? maxU + (maxU - minU || 0.1) * 0.25 : 1;

  const weighted = reports.map((item) => {
    const systemEnergy = normalize(item.totalSystemEnergy, minSystem, maxSystem);
    const comfortPenalty = normalize(item.comfortPenalty, minComfort, maxComfort);
    const comfortBandGap = normalize(1 - item.comfortBandRate, minComfortBandGap, maxComfortBandGap);
    const temperatureSwing = normalize(item.temperatureSwing, minSwing, maxSwing);
    const uNumeric = normalize(item.uValue ?? fallbackU, minU, Math.max(maxU, fallbackU));

    const finalScore =
      systemEnergy * 0.52 +
      comfortPenalty * 0.18 +
      comfortBandGap * 0.12 +
      temperatureSwing * 0.08 +
      uNumeric * 0.1;

    return {
      ...item,
      finalScore,
      scoreBreakdown: {
        systemEnergy,
        comfortPenalty,
        comfortBandGap,
        temperatureSwing,
        uValue: uNumeric,
      },
    } satisfies RankedReport;
  });

  return weighted.sort((a, b) => {
    if (a.finalScore !== b.finalScore) return a.finalScore - b.finalScore;
    if (a.uValue !== null && b.uValue !== null && a.uValue !== b.uValue) return a.uValue - b.uValue;
    return a.hvacTotal - b.hvacTotal;
  });
}
