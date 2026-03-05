import { NextRequest, NextResponse } from "next/server";

import { generateEngineeringReport, type OptimizationSummary } from "@/lib/ai/generateEngineeringReport";

export const runtime = "nodejs";
export const maxDuration = 60;

type GenerateReportBody = {
  summary?: OptimizationSummary;
};

const isValidSummary = (summary: unknown): summary is OptimizationSummary => {
  if (!summary || typeof summary !== "object") return false;
  const item = summary as Record<string, unknown>;

  return (
    typeof item.rowCount === "number" &&
    typeof item.oldTotalEnergy === "number" &&
    typeof item.newTotalEnergy === "number" &&
    typeof item.energySaved === "number" &&
    typeof item.optimizationMethod === "string"
  );
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as GenerateReportBody;
    const summary = body.summary;

    if (!isValidSummary(summary)) {
      return NextResponse.json({ success: false, error: "Gecerli bir summary zorunludur." }, { status: 400 });
    }

    const report = await generateEngineeringReport(summary, { timeoutMs: 45000 });

    return NextResponse.json({ success: true, summary, report }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Beklenmeyen bir hata olustu.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
