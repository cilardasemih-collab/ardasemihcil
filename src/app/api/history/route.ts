import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type CsvHistoryRow = {
  id: string;
  file_name: string;
  created_at: string;
  savings_amount: number | string | null;
  optimization_method: string | null;
  old_total_energy: number | string | null;
  new_total_energy: number | string | null;
  ai_report_markdown: string | null;
  analysis_payload: unknown;
};

type ReportHistoryRow = {
  id: string;
  report_group_id: string;
  scenario_id: string;
  language: "tr" | "en";
  report_title: string;
  section_key: string;
  section_title: string;
  section_order: number;
  status: string;
  section_content: string | null;
  context_snapshot?: { comparisonResult?: unknown } | null;
  created_at: string;
  updated_at: string;
  scenarios?:
    | {
        name?: string | null;
        total_energy_consumption?: number | null;
        projects?: { name?: string | null; location?: string | null } | Array<{ name?: string | null; location?: string | null }> | null;
      }
    | Array<{
        name?: string | null;
        total_energy_consumption?: number | null;
        projects?: { name?: string | null; location?: string | null } | Array<{ name?: string | null; location?: string | null }> | null;
      }>
    | null;
};

type DesignBuilderResultRow = {
  id: string;
  created_at: string;
  project_id: string | null;
  project_name: string | null;
  result_type: string;
  title: string;
  winner_scenario_id: string | null;
  winner_scenario_name: string | null;
  scenario_ids: string[] | null;
  result_payload: unknown;
};

const toNumber = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const firstItem = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const sortByCreatedAtDesc = <T extends { created_at: string }>(items: T[]) =>
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

export async function GET() {
  const supabase = createServiceClient();

  try {
    const [{ data: csvRows, error: csvError }, { data: reportRows, error: reportError }, designBuilderResults] =
      await Promise.all([
        supabase
          .from("analysis_results")
          .select(
            "id,file_name,created_at,savings_amount,optimization_method,old_total_energy,new_total_energy,ai_report_markdown,analysis_payload"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("reports")
          .select(
            "id,report_group_id,scenario_id,language,report_title,section_key,section_title,section_order,status,section_content,context_snapshot,created_at,updated_at,scenarios(name,total_energy_consumption,projects(name,location))"
          )
          .order("updated_at", { ascending: false }),
        supabase
          .from("designbuilder_results")
          .select(
            "id,created_at,project_id,project_name,result_type,title,winner_scenario_id,winner_scenario_name,scenario_ids,result_payload"
          )
          .order("created_at", { ascending: false })
          .then((result) => result),
      ]);

    if (csvError) throw new Error(csvError.message);
    if (reportError) throw new Error(reportError.message);

    const csvItems = ((csvRows ?? []) as CsvHistoryRow[]).map((row) => ({
      id: row.id,
      type: "csv_analysis" as const,
      title: row.file_name,
      created_at: row.created_at,
      summary: {
        savingsAmount: toNumber(row.savings_amount),
        oldTotalEnergy: toNumber(row.old_total_energy),
        newTotalEnergy: toNumber(row.new_total_energy),
        optimizationMethod: row.optimization_method ?? "-",
      },
      report: row.ai_report_markdown ?? "",
      payload: row.analysis_payload ?? null,
    }));

    const reportGroups = new Map<string, ReportHistoryRow[]>();
    for (const row of (reportRows ?? []) as ReportHistoryRow[]) {
      const group = reportGroups.get(row.report_group_id) ?? [];
      group.push(row);
      reportGroups.set(row.report_group_id, group);
    }

    const reportItems = [...reportGroups.entries()].map(([groupId, rows]) => {
      const sortedRows = [...rows].sort((a, b) => a.section_order - b.section_order);
      const first = sortedRows[0];
      const scenario = firstItem(firstItem(first?.scenarios));
      const project = firstItem(scenario?.projects);
      const completedCount = sortedRows.filter((row) => row.status === "completed").length;
      const comparisonSection = sortedRows.find((row) => row.section_key === "comparison_result");
      const latestUpdatedAt = sortedRows
        .map((row) => row.updated_at || row.created_at)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

      if (comparisonSection) {
        const comparisonPayload = comparisonSection.context_snapshot?.comparisonResult ?? null;

        return {
          id: groupId,
          type: "designbuilder_comparison" as const,
          title: first?.report_title ?? "DesignBuilder Karşılaştırma Sonucu",
          created_at: latestUpdatedAt ?? first?.created_at ?? "",
          projectName: project?.name ?? "DesignBuilder Projesi",
          winnerScenarioName:
            comparisonPayload && typeof comparisonPayload === "object"
              ? String((comparisonPayload as { winner?: { scenarioName?: string } }).winner?.scenarioName ?? scenario?.name ?? "")
              : scenario?.name ?? null,
          scenarioIds:
            comparisonPayload && typeof comparisonPayload === "object" && Array.isArray((comparisonPayload as { scenarios?: Array<{ scenarioId?: string }> }).scenarios)
              ? ((comparisonPayload as { scenarios: Array<{ scenarioId?: string }> }).scenarios.map((item) => String(item.scenarioId ?? "")).filter(Boolean))
              : [first?.scenario_id ?? ""].filter(Boolean),
          payload: comparisonPayload,
        };
      }

      return {
        id: groupId,
        type: "designbuilder_report" as const,
        title: first?.report_title ?? "DesignBuilder Raporu",
        created_at: latestUpdatedAt ?? first?.created_at ?? "",
        projectName: project?.name ?? "DesignBuilder Projesi",
        scenarioName: scenario?.name ?? "Senaryo",
        location: project?.location ?? null,
        totalEnergyConsumption: scenario?.total_energy_consumption ?? null,
        summary: {
          completedCount,
          totalCount: sortedRows.length,
          status: completedCount === sortedRows.length ? "completed" : "in_progress",
        },
        sections: sortedRows.map((row) => ({
          id: row.id,
          title: row.section_title,
          order: row.section_order,
          status: row.status,
          content: row.section_content ?? "",
        })),
      };
    });

    const designResultError = designBuilderResults.error;
    const designResultRows = designResultError ? [] : ((designBuilderResults.data ?? []) as DesignBuilderResultRow[]);
    const designResultItems = designResultRows.map((row) => ({
      id: row.id,
      type: "designbuilder_comparison" as const,
      title: row.title,
      created_at: row.created_at,
      projectName: row.project_name ?? "DesignBuilder Projesi",
      winnerScenarioName: row.winner_scenario_name ?? null,
      scenarioIds: row.scenario_ids ?? [],
      payload: row.result_payload ?? null,
    }));

    return NextResponse.json({
      success: true,
      items: sortByCreatedAtDesc([...csvItems, ...reportItems, ...designResultItems]),
      warnings: designResultError ? ["DesignBuilder karşılaştırma tablosu henüz hazır değil; yedek kayıtlar rapor geçmişinden okunuyor."] : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Geçmiş kayıtları okunamadı.";
    return NextResponse.json({ success: false, error: message, items: [] }, { status: 200 });
  }
}
