import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import type { SimulationData } from "@/lib/designbuilder/workspaceTypes";
import { buildScenarioSummary } from "@/services/designbuilderScenarioSummary";
import { generateSequentialReport, initializeReportSections } from "@/services/reportEngine";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  scenarioId: z.string().uuid(),
  reportGroupId: z.string().uuid(),
  language: z.enum(["tr", "en"]).default("tr"),
});

type ScenarioRow = {
  id: string;
  project_id: string;
  name: string;
  u_values: Record<string, number> | null;
  total_energy_consumption: number | null;
  projects: { name: string; location: string | null } | null;
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

export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const supabase = createServiceClient();

    const { data: scenarioData, error: scenarioError } = await supabase
      .from("scenarios")
      .select("id, project_id, name, u_values, total_energy_consumption, projects(name, location)")
      .eq("id", body.scenarioId)
      .single();

    if (scenarioError || !scenarioData) {
      return NextResponse.json({ success: false, error: scenarioError?.message ?? "Scenario bulunamadi." }, { status: 404 });
    }

    const { data: simulationRows, error: simulationError } = await supabase
      .from("simulation_data")
      .select("id, scenario_id, timestamp, zone_name, air_temperature, heating_load, cooling_load, humidity")
      .eq("scenario_id", body.scenarioId)
      .order("timestamp", { ascending: true });

    if (simulationError) {
      throw new Error(simulationError.message);
    }
    if (!simulationRows || simulationRows.length === 0) {
      return NextResponse.json({ success: false, error: "SimulationData bulunamadi." }, { status: 404 });
    }

    const scenario = scenarioData as unknown as ScenarioRow;
    const rows: SimulationData[] = (simulationRows as SimulationRow[]).map((row) => ({
      ...row,
      timestamp: new Date(row.timestamp),
    }));

    const scenarioSummary = buildScenarioSummary({
      scenario: {
        id: scenario.id,
        projectId: scenario.project_id,
        name: scenario.name,
        totalEnergyConsumption: scenario.total_energy_consumption,
        uValues: scenario.u_values ?? {},
        projectName: scenario.projects?.name ?? "Unknown Project",
        location: scenario.projects?.location ?? null,
      },
      rows,
    });

    const reportTitle =
      body.language === "tr"
        ? `${scenarioSummary.scenario.projectName} - DesignBuilder Teknik Raporu`
        : `${scenarioSummary.scenario.projectName} - DesignBuilder Technical Report`;

    await initializeReportSections({
      reportGroupId: body.reportGroupId,
      scenarioId: body.scenarioId,
      language: body.language,
      reportTitle,
    });

    const result = await generateSequentialReport({
      reportGroupId: body.reportGroupId,
      scenarioSummary,
      language: body.language,
    });

    return NextResponse.json({
      success: true,
      reportGroupId: body.reportGroupId,
      reportTitle,
      provider: result.provider,
      model: result.model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rapor olusturma sirasinda beklenmeyen hata.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
