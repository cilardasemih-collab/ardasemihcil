import Papa from "papaparse";

export type AiDiagnosis = {
  tespit: string;
  hedef_kolonlar: string[];
  matematiksel_islem_talimati: string;
};

export type ParsedCsvData = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

export type OptimizationSummary = {
  rowCount: number;
  oldTotalEnergy: number;
  newTotalEnergy: number;
  energySaved: number;
  optimizationMethod: string;
};

export type OeeSummary = {
  availabilityBefore: number;
  availabilityAfter: number;
  performanceBefore: number;
  performanceAfter: number;
  qualityBefore: number;
  qualityAfter: number;
  oeeBefore: number;
  oeeAfter: number;
  oeeGain: number;
};

export type ColumnContribution = {
  column: string;
  oldValue: number;
  newValue: number;
  saved: number;
};

export type AnomalyItem = {
  rowIndex: number;
  column: string;
  value: number;
  zScore: number;
};

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_ROW_LIMIT = 250000;

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;

  const normalizedText = text
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number(normalizedText);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractOptimizationFactor = (instruction: string): number => {
  const lowered = instruction.toLowerCase();
  const percentMatch = lowered.match(/(\d+(?:[.,]\d+)?)\s*%/);

  if (percentMatch) {
    const percent = Number(percentMatch[1].replace(",", "."));
    if (Number.isFinite(percent)) {
      if (/(azalt|dusur|dusu|reduce|decrease|save|tasarruf)/.test(lowered)) {
        return Math.max(0, 1 - percent / 100);
      }
      if (/(artir|increase|boost|raise)/.test(lowered)) {
        return 1 + percent / 100;
      }
      return 1 - percent / 100;
    }
  }

  const coefficientMatch = lowered.match(/(?:katsayi|carp|multiply|x\s*=?)\s*(\d+(?:[.,]\d+)?)/);
  if (coefficientMatch) {
    const coefficient = Number(coefficientMatch[1].replace(",", "."));
    if (Number.isFinite(coefficient) && coefficient > 0) {
      return coefficient;
    }
  }

  return 0.8;
};

const mapAiTargetsToHeaders = (headers: string[], targets: string[]): string[] => {
  if (!targets.length) return [];

  const normalizedHeaders = headers.map((header) => ({ original: header, normalized: normalize(header) }));
  const matches = new Set<string>();

  targets.forEach((target) => {
    const normalizedTarget = normalize(target);
    if (!normalizedTarget) return;

    normalizedHeaders.forEach((header) => {
      if (header.normalized === normalizedTarget || header.normalized.includes(normalizedTarget) || normalizedTarget.includes(header.normalized)) {
        matches.add(header.original);
      }
    });
  });

  return Array.from(matches);
};

const detectEnergyColumns = (headers: string[], aiTargets: string[]): string[] => {
  const keywords = ["energy", "consumption", "power", "motor", "kw", "kwh", "enerji", "tuketim", "guc"];
  const fromKeywords = headers.filter((header) => {
    const normalizedHeader = normalize(header);
    return keywords.some((keyword) => normalizedHeader.includes(keyword));
  });

  const fromTargets = mapAiTargetsToHeaders(headers, aiTargets);
  return Array.from(new Set([...fromKeywords, ...fromTargets]));
};

export const parseFullCsvContent = (csvContent: string): ParsedCsvData => {
  const estimatedBytes = Buffer.byteLength(csvContent, "utf8");
  if (estimatedBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error("CSV dosyasi cok buyuk. Maksimum 25MB desteklenir.");
  }

  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
    dynamicTyping: false,
  });

  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw new Error(`CSV parse hatasi: ${firstError.message}`);
  }

  const headers = (parsed.meta.fields ?? []).map((field) => field.trim()).filter(Boolean);
  if (!headers.length) {
    throw new Error("CSV basliklari okunamadi.");
  }

  const rows = (parsed.data ?? []).slice(0, MAX_ROW_LIMIT).map((row) => {
    const normalizedRow: Record<string, string> = {};
    headers.forEach((header) => {
      normalizedRow[header] = row[header] === undefined || row[header] === null ? "" : String(row[header]);
    });
    return normalizedRow;
  });

  return { headers, rows };
};

export const buildOptimizationSummary = (
  parsedCsv: ParsedCsvData,
  diagnosis: AiDiagnosis
): OptimizationSummary => {
  const headers = parsedCsv.headers;
  const rows = parsedCsv.rows;

  const targetColumns = mapAiTargetsToHeaders(headers, diagnosis.hedef_kolonlar ?? []);
  const energyColumns = detectEnergyColumns(headers, diagnosis.hedef_kolonlar ?? []);
  const columnsToProcess = energyColumns.length > 0 ? energyColumns : targetColumns;
  const factor = extractOptimizationFactor(diagnosis.matematiksel_islem_talimati);

  let oldTotalEnergy = 0;
  let newTotalEnergy = 0;

  rows.forEach((row) => {
    columnsToProcess.forEach((column) => {
      const value = toNumber(row[column]);
      if (value === null) return;
      oldTotalEnergy += value;
      newTotalEnergy += value * factor;
    });
  });

  const energySaved = oldTotalEnergy - newTotalEnergy;

  return {
    rowCount: rows.length,
    oldTotalEnergy: Number(oldTotalEnergy.toFixed(2)),
    newTotalEnergy: Number(newTotalEnergy.toFixed(2)),
    energySaved: Number(energySaved.toFixed(2)),
    optimizationMethod: diagnosis.matematiksel_islem_talimati,
  };
};

export const buildColumnContributions = (
  parsedCsv: ParsedCsvData,
  diagnosis: AiDiagnosis,
  limit = 6
): ColumnContribution[] => {
  const headers = parsedCsv.headers;
  const rows = parsedCsv.rows;
  const targetColumns = mapAiTargetsToHeaders(headers, diagnosis.hedef_kolonlar ?? []);
  const energyColumns = detectEnergyColumns(headers, diagnosis.hedef_kolonlar ?? []);
  const columnsToProcess = energyColumns.length > 0 ? energyColumns : targetColumns;
  const factor = extractOptimizationFactor(diagnosis.matematiksel_islem_talimati);

  const results = columnsToProcess
    .map((column) => {
      let oldValue = 0;
      let newValue = 0;

      rows.forEach((row) => {
        const value = toNumber(row[column]);
        if (value === null) return;
        oldValue += value;
        newValue += value * factor;
      });

      const saved = oldValue - newValue;
      return {
        column,
        oldValue: Number(oldValue.toFixed(2)),
        newValue: Number(newValue.toFixed(2)),
        saved: Number(saved.toFixed(2)),
      } satisfies ColumnContribution;
    })
    .filter((item) => item.oldValue > 0)
    .sort((a, b) => b.saved - a.saved)
    .slice(0, limit);

  return results;
};

const getStatusColumns = (headers: string[]): string[] => {
  const keywords = ["bearing", "wpump", "radiator", "exvalve", "acmotor", "status", "condition", "durum"];
  return headers.filter((header) => {
    const key = normalize(header);
    return keywords.some((word) => key.includes(word));
  });
};

const scoreStatusText = (value: string): number => {
  const text = normalize(value);
  if (!text) return 0.75;

  const positive = ["ok", "clean", "stable", "normal", "good", "healthy"];
  const negative = ["fault", "bad", "dirty", "unstable", "alert", "warning", "error"];

  if (positive.some((token) => text.includes(token))) return 1;
  if (negative.some((token) => text.includes(token))) return 0.4;
  return 0.75;
};

const computeAvailabilityBefore = (parsedCsv: ParsedCsvData): number => {
  const statusColumns = getStatusColumns(parsedCsv.headers);
  if (statusColumns.length === 0 || parsedCsv.rows.length === 0) return 0.9;

  let totalScore = 0;
  let count = 0;

  parsedCsv.rows.forEach((row) => {
    statusColumns.forEach((column) => {
      totalScore += scoreStatusText(row[column] ?? "");
      count += 1;
    });
  });

  const avg = count > 0 ? totalScore / count : 0.9;
  return clamp(avg, 0.7, 0.99);
};

const collectNumericSeries = (rows: Array<Record<string, string>>, column: string): number[] => {
  return rows
    .map((row) => toNumber(row[column]))
    .filter((value): value is number => value !== null);
};

const computeCv = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((acc, cur) => acc + cur, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((acc, cur) => acc + (cur - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  return std / Math.abs(mean);
};

const computePerformanceBefore = (parsedCsv: ParsedCsvData): number => {
  const perfColumns = parsedCsv.headers.filter((header) => {
    const key = normalize(header);
    return ["rpm", "motorpower", "torque", "airflow"].some((token) => key.includes(token));
  });

  if (perfColumns.length === 0) return 0.86;

  const cvs = perfColumns
    .map((column) => computeCv(collectNumericSeries(parsedCsv.rows, column)))
    .filter((value) => Number.isFinite(value));

  if (!cvs.length) return 0.86;

  const avgCv = cvs.reduce((acc, cur) => acc + cur, 0) / cvs.length;
  const score = 1 - avgCv * 0.6;
  return clamp(score, 0.68, 0.98);
};

const computeQualityBefore = (parsedCsv: ParsedCsvData): number => {
  const qualityColumns = parsedCsv.headers.filter((header) => {
    const key = normalize(header);
    return ["noise", "temp", "pressure"].some((token) => key.includes(token));
  });

  if (qualityColumns.length === 0) return 0.93;

  let anomalyCount = 0;
  let checkedCount = 0;

  qualityColumns.forEach((column) => {
    const values = collectNumericSeries(parsedCsv.rows, column);
    if (values.length < 12) return;

    const mean = values.reduce((acc, cur) => acc + cur, 0) / values.length;
    const variance = values.reduce((acc, cur) => acc + (cur - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    const low = mean - 2 * std;
    const high = mean + 2 * std;

    values.forEach((value) => {
      checkedCount += 1;
      if (value < low || value > high) anomalyCount += 1;
    });
  });

  if (checkedCount === 0) return 0.93;
  const anomalyRatio = anomalyCount / checkedCount;
  const score = 1 - anomalyRatio * 1.2;
  return clamp(score, 0.72, 0.995);
};

export const buildOeeSummary = (parsedCsv: ParsedCsvData, summary: OptimizationSummary): OeeSummary => {
  const availabilityBefore = computeAvailabilityBefore(parsedCsv);
  const performanceBefore = computePerformanceBefore(parsedCsv);
  const qualityBefore = computeQualityBefore(parsedCsv);

  const efficiencyGain = summary.oldTotalEnergy > 0 ? summary.energySaved / summary.oldTotalEnergy : 0;

  const availabilityAfter = clamp(availabilityBefore + efficiencyGain * 0.08, 0.7, 0.995);
  const performanceAfter = clamp(performanceBefore + efficiencyGain * 0.16, 0.68, 0.995);
  const qualityAfter = clamp(qualityBefore + efficiencyGain * 0.07, 0.72, 0.997);

  const oeeBefore = availabilityBefore * performanceBefore * qualityBefore;
  const oeeAfter = availabilityAfter * performanceAfter * qualityAfter;

  return {
    availabilityBefore: Number(availabilityBefore.toFixed(4)),
    availabilityAfter: Number(availabilityAfter.toFixed(4)),
    performanceBefore: Number(performanceBefore.toFixed(4)),
    performanceAfter: Number(performanceAfter.toFixed(4)),
    qualityBefore: Number(qualityBefore.toFixed(4)),
    qualityAfter: Number(qualityAfter.toFixed(4)),
    oeeBefore: Number(oeeBefore.toFixed(4)),
    oeeAfter: Number(oeeAfter.toFixed(4)),
    oeeGain: Number((oeeAfter - oeeBefore).toFixed(4)),
  };
};

export const detectTopAnomalies = (parsedCsv: ParsedCsvData, limit = 5): AnomalyItem[] => {
  const anomalyColumns = parsedCsv.headers.filter((header) => {
    const key = normalize(header);
    return ["noise", "temp", "pressure", "power", "flow", "torque"].some((token) => key.includes(token));
  });

  const candidates: AnomalyItem[] = [];

  anomalyColumns.forEach((column) => {
    const values = parsedCsv.rows.map((row) => toNumber(row[column]));
    const numericValues = values.filter((value): value is number => value !== null);
    if (numericValues.length < 20) return;

    const mean = numericValues.reduce((acc, cur) => acc + cur, 0) / numericValues.length;
    const variance = numericValues.reduce((acc, cur) => acc + (cur - mean) ** 2, 0) / numericValues.length;
    const std = Math.sqrt(variance);
    if (std === 0) return;

    values.forEach((value, index) => {
      if (value === null) return;
      const zScore = (value - mean) / std;
      if (Math.abs(zScore) >= 2.4) {
        candidates.push({
          rowIndex: index + 1,
          column,
          value: Number(value.toFixed(4)),
          zScore: Number(zScore.toFixed(4)),
        });
      }
    });
  });

  return candidates.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore)).slice(0, limit);
};
