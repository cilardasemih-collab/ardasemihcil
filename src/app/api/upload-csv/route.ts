import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const RAW_FILES_BUCKET = "raw-files";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "CSV dosyasi gerekli." }, { status: 400 });
    }

    const extension = file.name.split(".").pop() ?? "csv";
    const filePath = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const supabase = createServiceClient();
    const { data, error } = await supabase.storage.from(RAW_FILES_BUCKET).upload(filePath, buffer, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "text/csv",
    });

    if (error || !data?.path) {
      throw new Error(error?.message ?? "Dosya yuklenemedi.");
    }

    return NextResponse.json({
      success: true,
      filePath: data.path,
      fileName: file.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CSV upload sirasinda beklenmeyen hata.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
