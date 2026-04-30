import type { MonthlyPoint, ParsedDesignBuilderCsv } from "@/lib/designbuilder/types";

const REQUIRED_FIELDS = ["date", "heating", "cooling"] as const;

type HeaderIndexMap = {
  date: number;
  heating: number;
  cooling: number;
  fans: number;
  pumps: number;
  airTemp: number;
  operativeTemp: number;
  outsideTemp: number;
};

const normalizeText = (value: string) => value.replace(/^\uFEFF/, "").trim();

const normalizeToken = (value: string) =>
  String(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();

const detectDelimiter = (line: string) => {
  const semicolon = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  const tab = (line.match(/\t/g) || []).length;

  if (tab > semicolon && tab > comma) return "\t";
  if (semicolon >= comma) return ";";
  return ",";
};

const splitCsvLine = (line: string, delimiter: string) => {
  const out: string[] = [];
  let buffer = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        buffer += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      out.push(buffer.trim().replace(/^"|"$/g, ""));
      buffer = "";
      continue;
    }

    buffer += char;
  }

  out.push(buffer.trim().replace(/^"|"$/g, ""));
  return out;
};

const parseLocaleNumber = (rawValue: string | undefined) => {
  const value = String(rawValue ?? "").trim().replace(/^"|"$/g, "");
  if (!value) return 0;

  if (value.includes(",") && value.includes(".")) {
    const normalized = value.replace(/\./g, "").replace(/,/g, ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value.includes(",")) {
    const parsed = Number(value.replace(/,/g, "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const monthLabelFromDate = (input: string) => {
  const clean = String(input ?? "").trim().replace(/^"|"$/g, "");
  const parts = clean.split(".");
  if (parts.length < 3) return clean || "-";

  const month = Number(parts[1]);
  if (!Number.isFinite(month) || month < 1 || month > 12) return clean;
  return `${String(month).padStart(2, "0")}.${parts[2]}`;
};

const findHeaderIndex = (headers: string[], aliases: string[]) => {
  const normalizedHeaders = headers.map((item) => normalizeToken(item));
  return normalizedHeaders.findIndex((header) => aliases.some((alias) => header.includes(alias)));
};

const buildHeaderMap = (headers: string[]): HeaderIndexMap => {
  const map: HeaderIndexMap = {
    date: findHeaderIndex(headers, ["date/time", "date", "tarih"]),
    heating: findHeaderIndex(headers, ["heating (gas)", "heating", "isitma"]),
    cooling: findHeaderIndex(headers, ["cooling (electricity)", "cooling", "sogutma"]),
    fans: findHeaderIndex(headers, ["system fans", "fans", "fan"]),
    pumps: findHeaderIndex(headers, ["system pumps", "pumps", "pompa"]),
    airTemp: findHeaderIndex(headers, ["air temperature", "air temp", "hava sicakligi"]),
    operativeTemp: findHeaderIndex(headers, ["operative temperature", "operative temp", "operative"]),
    outsideTemp: findHeaderIndex(headers, ["outside dry-bulb temperature", "outside", "dis hava"]),
  };

  const missing = REQUIRED_FIELDS.filter((field) => map[field] < 0);
  if (missing.length > 0) {
    throw new Error(`CSV zorunlu kolonlari eksik: ${missing.join(", ")}`);
  }

  return map;
};

const detectUValueFromHeaders = (headers: string[], units: string[], firstDataRow: string[]) => {
  const normalizedHeaders = headers.map((item) => normalizeToken(item));
  const normalizedUnits = units.map((item) => normalizeToken(item));

  let uIndex = normalizedHeaders.findIndex(
    (header) =>
      header.includes("u value") ||
      header.includes("u-value") ||
      header.includes("u_value") ||
      header === "u" ||
      header.includes("u degeri")
  );

  if (uIndex < 0) {
    uIndex = normalizedUnits.findIndex((unit) => unit.includes("w/m2") || unit.includes("u"));
  }

  if (uIndex < 0 || uIndex >= firstDataRow.length) return null;

  const value = parseLocaleNumber(firstDataRow[uIndex]);
  if (value > 0) return value;
  return null;
};

const detectUValueFromFileName = (fileName: string) => {
  const normalized = normalizeToken(fileName);
  const regexes = [
    /(?:^|[_\-\s])u(?:[_\-\s]?value|[_\-\s]?degeri)?[_\-\s]?([0-9]+[\.,][0-9]+)/i,
    /(?:^|[_\-\s])([0-9]+[\.,][0-9]+)[_\-\s]?u(?:[_\-\s]|$)/i,
  ];

  for (const regex of regexes) {
    const match = normalized.match(regex);
    if (!match?.[1]) continue;
    const parsed = parseLocaleNumber(match[1]);
    if (parsed > 0) return parsed;
  }

  return null;
};

export function parseDesignBuilderCsv(content: string, fileName: string): ParsedDesignBuilderCsv {
  const clean = normalizeText(content);
  const lines = clean
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 3) {
    throw new Error("CSV icerigi yetersiz. Baslik, birim ve veri satirlari gerekli.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  const units = splitCsvLine(lines[1], delimiter);
  const rows = lines.slice(2).map((line) => splitCsvLine(line, delimiter));

  if (rows.length === 0) {
    throw new Error("CSV icinde analiz edilecek veri satiri yok.");
  }

  const headerMap = buildHeaderMap(headers);
  const sourceNotes: string[] = [];

  const months: MonthlyPoint[] = rows.map((row) => ({
    label: monthLabelFromDate(row[headerMap.date]),
    heatingGas: Math.max(0, parseLocaleNumber(row[headerMap.heating])),
    coolingElectricity: Math.abs(parseLocaleNumber(row[headerMap.cooling])),
    systemFans: headerMap.fans >= 0 ? Math.max(0, parseLocaleNumber(row[headerMap.fans])) : 0,
    systemPumps: headerMap.pumps >= 0 ? Math.max(0, parseLocaleNumber(row[headerMap.pumps])) : 0,
    airTemp: headerMap.airTemp >= 0 ? parseLocaleNumber(row[headerMap.airTemp]) : 0,
    operativeTemp: headerMap.operativeTemp >= 0 ? parseLocaleNumber(row[headerMap.operativeTemp]) : 0,
    outsideTemp: headerMap.outsideTemp >= 0 ? parseLocaleNumber(row[headerMap.outsideTemp]) : 0,
  }));

  let detectedUValue = detectUValueFromHeaders(headers, units, rows[0] || []);
  if (detectedUValue !== null) {
    sourceNotes.push("U degeri CSV kolonlarindan otomatik bulundu.");
  }

  if (detectedUValue === null) {
    const fromName = detectUValueFromFileName(fileName);
    if (fromName !== null) {
      detectedUValue = fromName;
      sourceNotes.push("U degeri dosya adindan cikarildi.");
    }
  }

  if (detectedUValue === null) {
    sourceNotes.push("U degeri otomatik bulunamadi. Manuel giris onerilir.");
  }

  return {
    months,
    detectedUValue,
    sourceNotes,
  };
}

export function parseManualUValue(raw: string): number | null {
  const value = parseLocaleNumber(raw);
  return value > 0 ? value : null;
}
