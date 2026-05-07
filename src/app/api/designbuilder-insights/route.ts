import { NextRequest, NextResponse } from "next/server";

import { generateGeminiText } from "@/lib/ai/geminiClient";
import {
  buildDesignBuilderActionPlan,
  buildDesignBuilderFallbackMarkdown,
  buildDesignBuilderInsightPayload,
} from "@/lib/designbuilder/insights";
import { rankReports } from "@/lib/designbuilder/scoring";
import type { DesignBuilderReport } from "@/lib/designbuilder/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  reports?: DesignBuilderReport[];
};

const buildPrompt = (payload: ReturnType<typeof buildDesignBuilderInsightPayload>) => {
  return [
    "Sen bina enerji simulasyonu, kabuk optimizasyonu ve DesignBuilder raporlamasi konusunda uzman bir muhendissin.",
    "Asagidaki karsilastirma verilerini kullanarak teknik ama okunabilir bir karar raporu yaz.",
    "Cevabi Markdown ver.",
    "Varsayim uydurma, sadece verilen verilere dayan.",
    "Zorunlu basliklar:",
    "1. Onerilen U Degeri",
    "2. Enerji ve Sistem Davranisi",
    "3. Termal Konfor ve Riskler",
    "4. Teknik Karar ve Sonraki Simulasyon Adimi",
    "Mumkunse oneriyi sayisal olarak savun ve trendin karisik oldugu durumlarda temkinli davran.",
    "Yapilandirilmis veri:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const reports = Array.isArray(body.reports) ? body.reports : [];

    if (reports.length === 0) {
      return NextResponse.json({ success: false, error: "Analiz icin en az bir rapor gerekli." }, { status: 400 });
    }

    const ranking = rankReports(reports);
    const payload = buildDesignBuilderInsightPayload(ranking);
    const actionPlan = buildDesignBuilderActionPlan(payload);

    let markdown = buildDesignBuilderFallbackMarkdown(payload);
    let fallbackUsed = true;
    let model: string | null = null;

    try {
      const aiResult = await generateGeminiText({
        prompt: buildPrompt(payload),
        temperature: 0.15,
        maxOutputTokens: 1400,
        timeoutMs: 40000,
      });

      if (aiResult.text.trim()) {
        markdown = aiResult.text.trim();
        model = aiResult.model;
        fallbackUsed = false;
      }
    } catch {
      fallbackUsed = true;
    }

    return NextResponse.json({
      success: true,
      markdown,
      actionPlan,
      payload,
      fallbackUsed,
      model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Beklenmeyen bir hata olustu.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
