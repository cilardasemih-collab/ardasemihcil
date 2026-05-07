import type { SimulationData } from "@/lib/designbuilder/workspaceTypes";

type MetricSummary = {
  min: number | null;
  max: number | null;
  avg: number | null;
};

type SummedMetricSummary = MetricSummary & {
  sum: number | null;
};

const summarizeMetric = (values: Array<number | null | undefined>): MetricSummary => {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (filtered.length === 0) {
    return { min: null, max: null, avg: null };
  }

  const sum = filtered.reduce((acc, cur) => acc + cur, 0);
  return {
    min: Number(Math.min(...filtered).toFixed(3)),
    max: Number(Math.max(...filtered).toFixed(3)),
    avg: Number((sum / filtered.length).toFixed(3)),
  };
};

const summarizeMetricWithSum = (values: Array<number | null | undefined>): SummedMetricSummary => {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (filtered.length === 0) {
    return { min: null, max: null, avg: null, sum: null };
  }

  const sum = filtered.reduce((acc, cur) => acc + cur, 0);
  return {
    min: Number(Math.min(...filtered).toFixed(3)),
    max: Number(Math.max(...filtered).toFixed(3)),
    avg: Number((sum / filtered.length).toFixed(3)),
    sum: Number(sum.toFixed(3)),
  };
};

const findPeak = (
  rows: SimulationData[],
  selector: (row: SimulationData) => number | null
): { value: number; timestamp: string; zoneName: string } | null => {
  let peak: SimulationData | null = null;
  let peakValue = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const value = selector(row);
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (value > peakValue) {
      peakValue = value;
      peak = row;
    }
  }

  if (!peak || !Number.isFinite(peakValue)) return null;

  return {
    value: Number(peakValue.toFixed(3)),
    timestamp: peak.timestamp.toISOString(),
    zoneName: peak.zone_name,
  };
};

const topZones = (rows: SimulationData[], selector: (row: SimulationData) => number | null) => {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const value = selector(row);
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    totals.set(row.zone_name, (totals.get(row.zone_name) ?? 0) + value);
  }

  return Array.from(totals.entries())
    .map(([zoneName, value]) => ({ zoneName, value: Number(value.toFixed(3)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
};

export function buildScenarioSummary(input: {
  scenario: {
    id: string;
    projectId?: string | null;
    name: string;
    totalEnergyConsumption: number | null;
    uValues: Record<string, number>;
    projectName: string;
    location: string | null;
  };
  rows: SimulationData[];
}) {
  const sortedRows = [...input.rows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const zoneCount = new Set(sortedRows.map((row) => row.zone_name)).size;
  const airTemperature = summarizeMetric(sortedRows.map((row) => row.air_temperature));
  const heatingLoad = summarizeMetricWithSum(sortedRows.map((row) => row.heating_load));
  const coolingLoad = summarizeMetricWithSum(sortedRows.map((row) => row.cooling_load));
  const humidity = summarizeMetric(sortedRows.map((row) => row.humidity));
  const anomalies: string[] = [];

  if ((airTemperature.max ?? -Infinity) > 60) {
    anomalies.push(`Air temperature max degeri supheli: ${airTemperature.max} C`);
  }
  if ((airTemperature.min ?? Infinity) < -40) {
    anomalies.push(`Air temperature min degeri supheli: ${airTemperature.min} C`);
  }
  if ((humidity.max ?? -Infinity) > 100) {
    anomalies.push(`Humidity degeri %100'u asiyor: ${humidity.max}`);
  }
  if ((heatingLoad.max ?? -Infinity) > 1_000_000) {
    anomalies.push(`Heating load pik degeri asiri yuksek: ${heatingLoad.max}`);
  }
  if ((coolingLoad.max ?? -Infinity) > 1_000_000) {
    anomalies.push(`Cooling load pik degeri asiri yuksek: ${coolingLoad.max}`);
  }

  return {
    scenario: input.scenario,
    summary: {
      rowCount: sortedRows.length,
      zoneCount,
      timeRange: {
        start: sortedRows[0]?.timestamp.toISOString() ?? null,
        end: sortedRows[sortedRows.length - 1]?.timestamp.toISOString() ?? null,
      },
      metrics: {
        airTemperature,
        heatingLoad,
        coolingLoad,
        humidity,
      },
      peaks: {
        heating: findPeak(sortedRows, (row) => row.heating_load),
        cooling: findPeak(sortedRows, (row) => row.cooling_load),
      },
      topZonesByHeating: topZones(sortedRows, (row) => row.heating_load),
      topZonesByCooling: topZones(sortedRows, (row) => row.cooling_load),
      detectedAnomalies: anomalies,
    },
  };
}
