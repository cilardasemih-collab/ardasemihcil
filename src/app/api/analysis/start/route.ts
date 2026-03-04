import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size <= 0) {
      return NextResponse.json({ success: false, error: "Dosya bulunamadı." }, { status: 400 });
    }

    const allowed = [".xlsx", ".xls", ".csv"];
    const fileName = file.name || `upload-${Date.now()}.csv`;
    const lowerName = fileName.toLowerCase();
    if (!allowed.some((ext) => lowerName.endsWith(ext))) {
      return NextResponse.json({ success: false, error: "Sadece .xlsx, .xls veya .csv yüklenebilir." }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();

    const safeName = fileName.replace(/\s+/g, "-");
    const filePath = `public/${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await serviceSupabase.storage
      .from("uploaded-excels")
      .upload(filePath, bytes, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const { data, error } = await serviceSupabase
      .from("analysis_jobs")
      .insert({
        user_id: null,
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
