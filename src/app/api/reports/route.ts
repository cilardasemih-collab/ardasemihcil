import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { listReportSections } from "@/services/reportEngine";

const querySchema = z.object({
  scenarioId: z.string().uuid().optional(),
  reportGroupId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse({
      scenarioId: url.searchParams.get("scenarioId") ?? undefined,
      reportGroupId: url.searchParams.get("reportGroupId") ?? undefined,
    });

    const sections = await listReportSections(query);
    return NextResponse.json({ success: true, sections });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rapor bolumleri okunamadi.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
