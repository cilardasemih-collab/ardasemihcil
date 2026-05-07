import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { analyzeFeedbackAndLearn } from "@/services/learningService";

const bodySchema = z.object({
  reportGroupId: z.string().uuid(),
  sectionKey: z.string().min(1),
  errorType: z.string().min(1),
  feedbackKind: z.enum(["error", "preference"]).default("error"),
  originalText: z.string().min(1),
  correctedText: z.string().optional().nullable(),
  engineerNote: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("user_feedback")
      .insert({
        report_group_id: body.reportGroupId,
        section_key: body.sectionKey,
        error_type: body.errorType,
        feedback_kind: body.feedbackKind,
        original_text: body.originalText,
        corrected_text: body.correctedText ?? null,
        engineer_note: body.engineerNote,
        ai_interpretation: null,
        resolved: false,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const feedbackId = String(data?.id ?? "");
    let learnedRule: { ruleDescription: string; category: string; scope: string } | null = null;

    if (feedbackId) {
      try {
        const learning = await analyzeFeedbackAndLearn({
          feedbackId,
          reportGroupId: body.reportGroupId,
          sectionKey: body.sectionKey,
          errorType: body.errorType,
          feedbackKind: body.feedbackKind,
          originalText: body.originalText,
          correctedText: body.correctedText ?? null,
          engineerNote: body.engineerNote,
        });
        learnedRule = {
          ruleDescription: learning.ruleDescription,
          category: learning.category,
          scope: learning.scope,
        };
      } catch {
        learnedRule = null;
      }
    }

    return NextResponse.json({ success: true, id: feedbackId || null, learnedRule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feedback kaydedilemedi.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
