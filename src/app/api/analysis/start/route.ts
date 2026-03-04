import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ success: false, error: "Giriş gerekli." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      fileName?: string;
      filePath?: string;
    };

    const fileName = String(body.fileName ?? "").trim();
    const filePath = String(body.filePath ?? "").trim();

    if (!fileName || !filePath) {
      return NextResponse.json({ success: false, error: "Dosya bilgisi eksik." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("analysis_jobs")
      .insert({
        user_id: user.id,
        file_name: fileName,
        file_path: filePath,
        status: "uploaded",
      })
      .select("id, status, file_name, file_path, created_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, job: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
