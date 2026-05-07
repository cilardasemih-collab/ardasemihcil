import { NextRequest, NextResponse } from "next/server";

import { processDocumentToVectorStore } from "@/services/documentProcessor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "file alanina PDF veya Excel yuklenmeli." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await processDocumentToVectorStore({
      fileName: file.name,
      mimeType: file.type,
      buffer: Buffer.from(arrayBuffer),
      metadata: {
        uploadedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      chunkCount: result.chunkCount,
      insertedIds: result.insertedIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dokuman ingest sirasinda beklenmeyen hata.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
