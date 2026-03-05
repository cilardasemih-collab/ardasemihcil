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

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_ROW_LIMIT = 250000;

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

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
