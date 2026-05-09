import Papa, { type ParseResult } from "papaparse";

import {
  simulationDataInsertSchema,
  type SimulationDataInsert,
} from "@/lib/designbuilder/workspaceTypes";

type CanonicalField =
  | "timestamp"
  | "zone_name"
  | "air_temperature"
  | "heating_load"
  | "cooling_load"
  | "humidity";

type HeaderMapping = Record<CanonicalField, string | null>;

export type SimulationCsvPreviewRow = {
  index: number;
  raw: Record<string, string>;
  normalized: SimulationDataInsert;
};

export type SimulationCsvParseResult = {
  headerMapping: HeaderMapping;
  previewRows: SimulationCsvPreviewRow[];
  rows: SimulationDataInsert[];
  rowCount: number;
  warnings: string[];
};

type ParseOptions = {
  scenarioId: string;
  onProgress?: (progress: number) => void;
  onPreviewRows?: (rows: SimulationCsvPreviewRow[]) => void;
  maxPreviewRows?: number;
};

const HEADER_ALIASES: Record<CanonicalField, string[]> = {
  timestamp: ["date/time", "datetime", "date", "timestamp", "time", "tarih"],
  zone_name: ["zone", "zone name", "room", "thermal zone", "mahall", "zone_name"],
  air_temperature: ["air temperature", "air temp", "dry bulb", "sicaklik", "air_temperature"],
  heating_load: ["heating load", "heating", "load heating", "isitma", "heating_load"],
  cooling_load: ["cooling load", "cooling", "load cooling", "sogutma", "cooling_load"],
  humidity: ["humidity", "relative humidity", "rh", "nem"],
};

const normalizeToken = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .replace(/\u00a0/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, "").replace(/,/g, ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseCsvTimestamp = (value: unknown, rowIndex: number) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string") return new Date(Date.UTC(2026, 0, 1, rowIndex));

  const raw = value.trim();
  if (!raw) return new Date(Date.UTC(2026, 0, 1, rowIndex));

  const nativeParsed = new Date(raw);
  if (!Number.isNaN(nativeParsed.getTime())) return nativeParsed;

  const normalized = raw.replace(/\//g, ".").replace("T", " ").replace(/\s+/g, " ");
  const match = normalized.match(
    /^(\d{1,2})[.](\d{1,2})(?:[.](\d{2,4}))?(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );

  if (!match) return new Date(Date.UTC(2026, 0, 1, rowIndex));

  const [, firstStr, secondStr, yearStr, hourStr = "0", minuteStr = "0", secondPartStr = "0"] = match;
  const year = yearStr ? (yearStr.length === 2 ? Number(`20${yearStr}`) : Number(yearStr)) : 2026;
  const first = Number(firstStr);
  const second = Number(secondStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const secondPart = Number(secondPartStr);
  const month = first > 12 ? second - 1 : first - 1;
  const day = first > 12 ? first : second;
  const parsed = new Date(year, month, day, hour, minute, secondPart);

  return Number.isNaN(parsed.getTime()) ? new Date(Date.UTC(2026, 0, 1, rowIndex)) : parsed;
};

const convertEnergyToKwh = (value: number | null, header: string | null) => {
  if (value === null || !header) return value;
  const normalized = normalizeToken(header);
  if (normalized.includes("mwh")) return value * 1000;
  if (normalized.includes("kwh")) return value;
  if (normalized.includes("kbtu")) return value * 0.293071;
  if (normalized.includes("btu")) return value * 0.000293071;
  if (normalized.includes("wh")) return value / 1000;
  return value;
};

const resolveHeaderMapping = (headers: string[]): HeaderMapping => {
  const normalizedHeaders = headers.map((header) => normalizeToken(header));

  const findHeader = (field: CanonicalField) => {
    const aliases = HEADER_ALIASES[field];
    const index = normalizedHeaders.findIndex((header) => aliases.some((alias) => header.includes(alias)));
    return index >= 0 ? headers[index] : null;
  };

  return {
    timestamp: findHeader("timestamp"),
    zone_name: findHeader("zone_name"),
    air_temperature: findHeader("air_temperature"),
    heating_load: findHeader("heating_load"),
    cooling_load: findHeader("cooling_load"),
    humidity: findHeader("humidity"),
  };
};

const normalizeRow = (row: Record<string, unknown>, headerMapping: HeaderMapping, scenarioId: string, rowIndex: number) => {
  const timestampValue = headerMapping.timestamp ? row[headerMapping.timestamp] : null;
  const zoneValue = headerMapping.zone_name ? row[headerMapping.zone_name] : null;

  return simulationDataInsertSchema.parse({
    scenario_id: scenarioId,
    timestamp: parseCsvTimestamp(timestampValue, rowIndex),
    zone_name: typeof zoneValue === "string" && zoneValue.trim() ? zoneValue.trim() : "Undefined Zone",
    air_temperature: parseNumber(headerMapping.air_temperature ? row[headerMapping.air_temperature] : null),
    heating_load: convertEnergyToKwh(
      parseNumber(headerMapping.heating_load ? row[headerMapping.heating_load] : null),
      headerMapping.heating_load
    ),
    cooling_load: convertEnergyToKwh(
      parseNumber(headerMapping.cooling_load ? row[headerMapping.cooling_load] : null),
      headerMapping.cooling_load
    ),
    humidity: parseNumber(headerMapping.humidity ? row[headerMapping.humidity] : null),
  });
};

export function parseSimulationCsvFile(file: File, options: ParseOptions): Promise<SimulationCsvParseResult> {
  const warnings: string[] = [];
  const previewRows: SimulationCsvPreviewRow[] = [];
  const rows: SimulationDataInsert[] = [];
  const maxPreviewRows = options.maxPreviewRows ?? 10;
  let headerMapping: HeaderMapping | null = null;
  let processedRows = 0;

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      worker: true,
      skipEmptyLines: "greedy",
      chunkSize: 1024 * 256,
      chunk(results: ParseResult<Record<string, string>>) {
        const fields = results.meta.fields ?? [];
        if (!headerMapping) {
          headerMapping = resolveHeaderMapping(fields);
          if (!headerMapping.timestamp || !headerMapping.zone_name) {
            warnings.push("Timestamp veya zone alanlari otomatik eslesmedi; varsayilan alanlar kullanildi.");
          }
        }

        for (const rawRow of results.data) {
          if (!rawRow || Object.keys(rawRow).length === 0) continue;

          try {
            const normalized = normalizeRow(rawRow, headerMapping, options.scenarioId, processedRows);
            rows.push(normalized);
            processedRows += 1;

            if (previewRows.length < maxPreviewRows) {
              previewRows.push({
                index: processedRows,
                raw: Object.fromEntries(Object.entries(rawRow).map(([key, value]) => [key, String(value ?? "")])),
                normalized,
              });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Satir dogrulanamadi";
            warnings.push(`Satir ${processedRows + 1}: ${message}`);
          }
        }

        const cursor = typeof results.meta.cursor === "number" ? results.meta.cursor : 0;
        const progress = file.size > 0 ? Math.min(100, Math.round((cursor / file.size) * 100)) : 100;
        options.onProgress?.(progress);
        options.onPreviewRows?.([...previewRows]);
      },
      complete() {
        options.onProgress?.(100);
        if (!headerMapping) {
          reject(new Error("CSV basliklari okunamadi."));
          return;
        }

        resolve({
          headerMapping,
          previewRows,
          rows,
          rowCount: rows.length,
          warnings,
        });
      },
      error(error) {
        reject(error);
      },
    });
  });
}
