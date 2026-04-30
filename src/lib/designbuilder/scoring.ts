import type { DesignBuilderReport, RankedReport, UValueSource } from "@/lib/designbuilder/types";

const avg = (items: number[]) => {
  if (items.length === 0) return 0;
  return items.reduce((sum, item) => sum + item, 0) / items.length;
};

const normalize = (value: number, min: number, max: number) => {
  if (max - min <= 0) return 0;
  return (value - min) / (max - min);
};

const detectUValueSource = (manualU: number | null, detectedU: number | null): UValueSource => {
  if (manualU !== null) return "manual";
  if (detectedU !== null) return "detected";
  return "missing";
};

export function buildReport(input: {
  id: string;
  fileName: string;
  manualU: number | null;
  detectedU: number | null;
  sourceNotes: string[];
  months: DesignBuilderReport["months"];
}): DesignBuilderReport {
  const uValueSource = detectUValueSource(input.manualU, input.detectedU);
  const uValue = input.manualU ?? input.detectedU;

  const totalHeatingGas = input.months.reduce((sum, row) => sum + row.heatingGas, 0);
  const totalCoolingElectricity = input.months.reduce((sum, row) => sum + row.coolingElectricity, 0);
  const totalFans = input.months.reduce((sum, row) => sum + row.systemFans, 0);
  const totalPumps = input.months.reduce((sum, row) => sum + row.systemPumps, 0);
  const hvacTotal = totalHeatingGas + totalCoolingElectricity;

  const avgAirTemp = avg(input.months.map((row) => row.airTemp));
  const avgOperativeTemp = avg(input.months.map((row) => row.operativeTemp));
  const avgOutsideTemp = avg(input.months.map((row) => row.outsideTemp));

  const comfortPenalty = input.months.reduce((sum, row) => {
    if (row.operativeTemp < 20) return sum + (20 - row.operativeTemp) * 120;
    if (row.operativeTemp > 26) return sum + (row.operativeTemp - 26) * 120;
    return sum;
  }, 0);

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
    hvacTotal,
    avgAirTemp,
    avgOperativeTemp,
    avgOutsideTemp,
    comfortPenalty,
  };
}

export function rankReports(reports: DesignBuilderReport[]): RankedReport[] {
  if (reports.length === 0) return [];

  const hvacValues = reports.map((item) => item.hvacTotal);
  const parasiticValues = reports.map((item) => item.totalFans + item.totalPumps);
  const comfortValues = reports.map((item) => item.comfortPenalty);
  const uValues = reports.map((item) => item.uValue).filter((item): item is number => item !== null);

  const minHvac = Math.min(...hvacValues);
  const maxHvac = Math.max(...hvacValues);
  const minParasitic = Math.min(...parasiticValues);
  const maxParasitic = Math.max(...parasiticValues);
  const minComfort = Math.min(...comfortValues);
  const maxComfort = Math.max(...comfortValues);
  const minU = uValues.length > 0 ? Math.min(...uValues) : 0;
  const maxU = uValues.length > 0 ? Math.max(...uValues) : 1;
  const fallbackU = uValues.length > 0 ? maxU + (maxU - minU || 0.1) * 0.25 : 1;

  const weighted = reports.map((item) => {
    const hvac = normalize(item.hvacTotal, minHvac, maxHvac);
    const parasitic = normalize(item.totalFans + item.totalPumps, minParasitic, maxParasitic);
    const comfort = normalize(item.comfortPenalty, minComfort, maxComfort);
    const uNumeric = normalize(item.uValue ?? fallbackU, minU, Math.max(maxU, fallbackU));

    const finalScore = hvac * 0.55 + parasitic * 0.2 + comfort * 0.15 + uNumeric * 0.1;

    return {
      ...item,
      finalScore,
      scoreBreakdown: {
        hvac,
        parasitic,
        comfort,
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
