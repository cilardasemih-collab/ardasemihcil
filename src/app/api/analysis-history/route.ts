import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("analysis_results")
      .select(
        "id,file_name,created_at,savings_amount,optimization_method,old_total_energy,new_total_energy,ai_report_markdown,analysis_payload"
      )
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      items: data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gecmis analizler okunamadi.";
    return NextResponse.json({ success: false, error: message, items: [] }, { status: 200 });
  }
}
