import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const jobId = String(request.nextUrl.searchParams.get("jobId") ?? "").trim();
    if (!jobId) {
      return NextResponse.json({ success: false, error: "jobId eksik." }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();
    const { data, error } = await serviceSupabase
      .from("processed_data")
      .select("row_index,payload")
      .eq("job_id", jobId)
      .order("row_index", { ascending: true })
      .limit(300);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, rows: data ?? [] }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
