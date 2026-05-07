import { z } from "zod";

const parseFlexibleDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  const nativeParsed = new Date(raw);
  if (!Number.isNaN(nativeParsed.getTime())) {
    return nativeParsed;
  }

  const normalized = raw.replace(/\//g, ".").replace("T", " ");
  const match = normalized.match(
    /^(\d{1,2})[.\-](\d{1,2})[.\-](\d{2,4})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );

  if (!match) return null;

  const [, dayStr, monthStr, yearStr, hourStr = "0", minuteStr = "0", secondStr = "0"] = match;
  const year = yearStr.length === 2 ? Number(`20${yearStr}`) : Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  const parsed = new Date(year, month, day, hour, minute, second);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const nullableNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\s+/g, "").replace(/,/g, ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}, z.number().nullable());

const nullableDate = z.preprocess((value) => {
  const parsed = parseFlexibleDate(value);
  return parsed ?? value;
}, z.date());

export const projectSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1),
  location: z.string().nullable().optional(),
  climate_data: z.record(z.string(), z.unknown()).default({}),
  created_at: nullableDate,
});

export const projectInsertSchema = projectSchema.omit({ id: true, created_at: true }).extend({
  location: z.string().min(1).nullable().optional(),
});

export const scenarioSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  name: z.string().min(1),
  u_values: z.record(z.string(), z.number()).default({}),
  total_energy_consumption: nullableNumber,
  cost_estimate: nullableNumber,
  created_at: nullableDate,
});

export const scenarioInsertSchema = scenarioSchema.omit({ id: true, created_at: true });

export const simulationDataSchema = z.object({
  id: z.string().uuid(),
  scenario_id: z.string().uuid(),
  timestamp: nullableDate,
  zone_name: z.string().min(1),
  air_temperature: nullableNumber,
  heating_load: nullableNumber,
  cooling_load: nullableNumber,
  humidity: nullableNumber,
});

export const simulationDataInsertSchema = simulationDataSchema.omit({ id: true });

export const userFeedbackSchema = z.object({
  id: z.string().uuid(),
  report_group_id: z.string().uuid().nullable().optional(),
  section_key: z.string().nullable().optional(),
  error_type: z.string().min(1),
  feedback_kind: z.enum(["error", "preference"]).default("error"),
  original_text: z.string().min(1),
  corrected_text: z.string().nullable().optional(),
  engineer_note: z.string().nullable().optional(),
  ai_interpretation: z.string().nullable().optional(),
  resolved: z.boolean().default(false),
});

export const userFeedbackInsertSchema = userFeedbackSchema.omit({ id: true });

export type Project = z.infer<typeof projectSchema>;
export type ProjectInsert = z.infer<typeof projectInsertSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioInsert = z.infer<typeof scenarioInsertSchema>;
export type SimulationData = z.infer<typeof simulationDataSchema>;
export type SimulationDataInsert = z.infer<typeof simulationDataInsertSchema>;
export type UserFeedback = z.infer<typeof userFeedbackSchema>;
export type UserFeedbackInsert = z.infer<typeof userFeedbackInsertSchema>;

export type DesignBuilderWorkspaceSnapshot = {
  projects: Project[];
  scenarios: Scenario[];
  previewRows: SimulationDataInsert[];
};
