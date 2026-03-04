import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const serviceSupabase = createServiceClient();
    const { data, error } = await serviceSupabase
      .from("analysis_jobs")
      .select("id,file_name,file_path,status,report_text,error_text,created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, jobs: data ?? [] }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
