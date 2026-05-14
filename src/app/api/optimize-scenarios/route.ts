import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import type { SimulationData } from "@/lib/designbuilder/workspaceTypes";
import { buildScenarioSummary } from "@/services/designbuilderScenarioSummary";
import type { ScenarioSummaryPayload } from "@/services/aiOrchestrator";
import { buildOptimizationDecision } from "@/services/optimizationService";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  scenarioIds: z.array(z.string().uuid()).default([]),
  language: z.enum(["tr", "en"]).default("tr"),
  scenarioPayloads: z
    .array(
      z.object({
        summary: z.custom<ScenarioSummaryPayload>(),
        costEstimate: z.number().nullable(),
        reportMarkdown: z.string().optional().nullable(),
      })
    )
    .default([]),
});

type ScenarioRow = {
  id: string;
  project_id: string;
  name: string;
  u_values: Record<string, number> | null;
  total_energy_consumption: number | null;
  cost_estimate: number | null;
  projects:
    | {
        name: string;
        location: string | null;
      }
    | Array<{
        name: string;
        location: string | null;
      }>
    | null;
};

const projectMetaFromRow = (row: ScenarioRow) => {
  const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
  return {
    name: project?.name ?? "Unknown Project",
    location: project?.location ?? null,
  };
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
    const summaries = [...body.scenarioPayloads];
    const collectedIds = new Set(summaries.map((item) => item.summary.scenario.id));
    const remainingIds = body.scenarioIds.filter((scenarioId) => !collectedIds.has(scenarioId));

    if (remainingIds.length > 0) {
      try {
        const supabase = createServiceClient();

        const { data: scenariosData, error: scenariosError } = await supabase
          .from("scenarios")
          .select("id, project_id, name, u_values, total_energy_consumption, cost_estimate, projects(name, location)")
          .in("id", remainingIds);

        if (scenariosError) {
          throw new Error(scenariosError.message);
        }

        const scenarioRows = (scenariosData ?? []) as ScenarioRow[];
        for (const scenario of scenarioRows) {
          const { data: simulationRows, error: simulationError } = await supabase
            .from("simulation_data")
            .select("id, scenario_id, timestamp, zone_name, air_temperature, heating_load, cooling_load, humidity")
            .eq("scenario_id", scenario.id)
            .order("timestamp", { ascending: true });

          if (simulationError) {
            throw new Error(simulationError.message);
          }
          if (!simulationRows || simulationRows.length === 0) {
            continue;
          }

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
              projectName: projectMetaFromRow(scenario).name,
              location: projectMetaFromRow(scenario).location,
            },
            rows,
          });

          summaries.push({
            summary,
            costEstimate: scenario.cost_estimate,
            reportMarkdown: null,
          });
        }
      } catch (error) {
        if (summaries.length < 2) {
          throw error;
        }
      }
    }

    if (summaries.length < 2) {
      return NextResponse.json({ success: false, error: "Karsilastirma icin en az iki scenario ozeti gerekli." });
    }

    const result = await buildOptimizationDecision({
      scenarios: summaries,
      language: body.language,
    });

    return NextResponse.json({
      success: true,
      winner: result.winner,
      scenarios: result.scenarios,
      sectionWinners: result.sectionWinners,
      latexTable: result.latexTable,
      strategistSummary: result.strategistSummary,
      baselineScenarioId: result.baselineScenarioId,
      currency: result.currency,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Optimization karsilastirmasi sirasinda hata olustu.";
    return NextResponse.json({ success: false, error: message });
  }
}
