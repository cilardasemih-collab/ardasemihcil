import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { buildScenarioSummary } from "@/services/designbuilderScenarioSummary";
import { runScenarioAiOrchestration } from "@/services/aiOrchestrator";
import type { SimulationData } from "@/lib/designbuilder/workspaceTypes";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  scenarioId: z.string().uuid(),
  language: z.enum(["tr", "en"]).default("tr"),
});

type ScenarioRow = {
  id: string;
  project_id: string;
  name: string;
  u_values: Record<string, number> | null;
  total_energy_consumption: number | null;
  projects: {
    id: string;
    name: string;
    location: string | null;
    climate_data: Record<string, unknown> | null;
  } | null;
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
    const parsedBody = bodySchema.parse(await request.json().catch(() => ({})));
    const supabase = createServiceClient();

    const { data: scenarioData, error: scenarioError } = await supabase
      .from("scenarios")
      .select("id, project_id, name, u_values, total_energy_consumption, projects(id, name, location, climate_data)")
      .eq("id", parsedBody.scenarioId)
      .single();

    if (scenarioError || !scenarioData) {
      return NextResponse.json(
        { success: false, error: scenarioError?.message ?? "Scenario bulunamadi." },
        { status: 404 }
      );
    }

    const scenario = scenarioData as unknown as ScenarioRow;

    const { data: simulationRows, error: simulationError } = await supabase
      .from("simulation_data")
      .select("id, scenario_id, timestamp, zone_name, air_temperature, heating_load, cooling_load, humidity")
      .eq("scenario_id", parsedBody.scenarioId)
      .order("timestamp", { ascending: true });

    if (simulationError) {
      throw new Error(simulationError.message);
    }

    if (!simulationRows || simulationRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Bu scenario icin SimulationData kaydi bulunamadi." },
        { status: 404 }
      );
    }

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
        projectContext: scenario.projects?.climate_data ?? {},
      },
      rows,
    });

    const orchestration = await runScenarioAiOrchestration({
      payload: scenarioSummary,
      language: parsedBody.language,
    });

    return NextResponse.json({
      success: true,
      scenarioId: scenario.id,
      trace: orchestration.trace,
      analyst: orchestration.analyst,
      audit: orchestration.audit,
      report: orchestration.report,
      provider: orchestration.provider,
      model: orchestration.model,
      retriesUsed: orchestration.retriesUsed,
      scenarioSummary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scenario analizi sirasinda beklenmeyen hata.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
