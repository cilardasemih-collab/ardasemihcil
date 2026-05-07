import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import {
  projectSchema,
  scenarioSchema,
  simulationDataInsertSchema,
} from "@/lib/designbuilder/workspaceTypes";

export const runtime = "nodejs";
export const maxDuration = 60;

const saveScenarioBodySchema = projectSchema.extend({
  scenario: scenarioSchema,
  rows: simulationDataInsertSchema.array(),
});

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = saveScenarioBodySchema.parse({
      ...rawBody.project,
      scenario: rawBody.scenario,
      rows: rawBody.rows,
    });

    const project = {
      id: parsed.id,
      user_id: parsed.user_id,
      name: parsed.name,
      location: parsed.location ?? null,
      climate_data: parsed.climate_data,
      created_at: parsed.created_at.toISOString(),
    };

    const scenario = {
      id: parsed.scenario.id,
      project_id: parsed.scenario.project_id,
      name: parsed.scenario.name,
      u_values: parsed.scenario.u_values,
      total_energy_consumption: parsed.scenario.total_energy_consumption,
      cost_estimate: parsed.scenario.cost_estimate,
      created_at: parsed.scenario.created_at.toISOString(),
    };

    const rows = parsed.rows.map((row) => ({
      ...row,
      timestamp: row.timestamp.toISOString(),
    }));

    const supabase = createServiceClient();

    const { error: projectError } = await supabase.from("projects").upsert(project);
    if (projectError) throw new Error(projectError.message);

    const { error: scenarioError } = await supabase.from("scenarios").upsert(scenario);
    if (scenarioError) throw new Error(scenarioError.message);

    const { error: deleteError } = await supabase.from("simulation_data").delete().eq("scenario_id", scenario.id);
    if (deleteError) throw new Error(deleteError.message);

    const batchSize = 500;
    for (let index = 0; index < rows.length; index += batchSize) {
      const chunk = rows.slice(index, index + batchSize);
      const { error: insertError } = await supabase.from("simulation_data").insert(chunk);
      if (insertError) throw new Error(insertError.message);
    }

    return NextResponse.json({
      success: true,
      projectId: project.id,
      scenarioId: scenario.id,
      rowCount: rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scenario kaydi sirasinda beklenmeyen hata.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
