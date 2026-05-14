import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import type { SimulationData } from "@/lib/designbuilder/workspaceTypes";
import { buildScenarioSummary } from "@/services/designbuilderScenarioSummary";
import { generateReportSectionsFrom, listReportSections, updateReportSectionContent } from "@/services/reportEngine";
import { REPORT_SECTION_DEFINITIONS, REPORT_SECTION_KEYS } from "@/types/report";

const patchSchema = z.object({
  reportGroupId: z.string().uuid(),
  sectionKey: z.enum(REPORT_SECTION_KEYS),
  sectionContent: z.string().min(1),
});

const postSchema = z.object({
  reportGroupId: z.string().uuid(),
  scenarioId: z.string().uuid(),
  sectionKey: z.enum(REPORT_SECTION_KEYS),
  language: z.enum(["tr", "en"]).default("tr"),
});

type ScenarioRow = {
  id: string;
  project_id: string;
  name: string;
  u_values: Record<string, number> | null;
  total_energy_consumption: number | null;
  projects: { name: string; location: string | null; climate_data: Record<string, unknown> | null } | null;
};

type SimulationRow = {
  id: string;
  scenario_id: string;
  timestamp: string;
  zone_name: string;
  air_temperature: number | null;
  heating_load: number | null;
  cooling_load: number | null;
  humidity: number | null;
};

export async function PATCH(request: NextRequest) {
  try {
    const body = patchSchema.parse(await request.json().catch(() => ({})));
    await updateReportSectionContent(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rapor bolumu guncellenemedi.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = postSchema.parse(await request.json().catch(() => ({})));
    const existingSections = await listReportSections({ reportGroupId: body.reportGroupId });
    const targetIndex = REPORT_SECTION_DEFINITIONS.findIndex((section) => section.key === body.sectionKey);
    if (targetIndex < 0) {
      throw new Error("Section bulunamadi.");
    }

    const supabase = createServiceClient();
    const { data: scenarioData, error: scenarioError } = await supabase
      .from("scenarios")
      .select("id, project_id, name, u_values, total_energy_consumption, projects(name, location, climate_data)")
      .eq("id", body.scenarioId)
      .single();
    if (scenarioError || !scenarioData) {
      throw new Error(scenarioError?.message ?? "Scenario bulunamadi.");
    }

    const { data: simulationRows, error: simulationError } = await supabase
      .from("simulation_data")
      .select("id, scenario_id, timestamp, zone_name, air_temperature, heating_load, cooling_load, humidity")
      .eq("scenario_id", body.scenarioId)
      .order("timestamp", { ascending: true });
    if (simulationError || !simulationRows) {
      throw new Error(simulationError?.message ?? "SimulationData bulunamadi.");
    }

    const scenario = scenarioData as unknown as ScenarioRow;
    const rows: SimulationData[] = (simulationRows as SimulationRow[]).map((row) => ({
      ...row,
      timestamp: new Date(row.timestamp),
    }));

    const summary = buildScenarioSummary({
      scenario: {
        id: scenario.id,
        projectId: scenario.project_id,
        name: scenario.name,
        totalEnergyConsumption: scenario.total_energy_consumption,
        uValues: scenario.u_values ?? {},
        projectName: scenario.projects?.name ?? "Unknown Project",
        location: scenario.projects?.location ?? null,
        projectContext: scenario.projects?.climate_data ?? {},
      },
      rows,
    });

    const initialMemory = existingSections
      .filter((section) => section.sectionOrder < REPORT_SECTION_DEFINITIONS[targetIndex].order && section.sectionSummary)
      .map((section) => ({
        title: section.sectionTitle,
        summary: section.sectionSummary ?? "",
      }));

    await generateReportSectionsFrom({
      reportGroupId: body.reportGroupId,
      scenarioSummary: summary,
      language: body.language,
      startSectionKey: body.sectionKey,
      initialMemory,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Section regenerate edilemedi.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
