import { NextRequest, NextResponse } from "next/server";

import { generateOeeActionPlan } from "@/lib/ai/generateActionPlan";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  optimizationMethod?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const optimizationMethod = String(body.optimizationMethod ?? "").trim();

    if (!optimizationMethod) {
      return NextResponse.json({ success: false, error: "optimizationMethod zorunludur." }, { status: 400 });
    }

    const actionPlan = await generateOeeActionPlan({ optimizationMethod }, { timeoutMs: 30000 });
    return NextResponse.json({ success: true, actionPlan }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Beklenmeyen bir hata olustu.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
