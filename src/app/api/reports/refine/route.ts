import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { generateLlmText } from "@/lib/ai/llmClient";
import { updateReportSectionContent, listReportSections } from "@/services/reportEngine";
import { REPORT_SECTION_KEYS } from "@/types/report";

const bodySchema = z.object({
  reportGroupId: z.string().uuid(),
  sectionKey: z.enum(REPORT_SECTION_KEYS),
  engineerNote: z.string().min(1),
  language: z.enum(["tr", "en"]).default("tr"),
});

const parseRefinedContent = (text: string) => {
  return text
    .trim()
    .replace(/^```markdown\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
};

export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const sections = await listReportSections({ reportGroupId: body.reportGroupId });
    const target = sections.find((section) => section.sectionKey === body.sectionKey);

    if (!target) {
      return NextResponse.json({ success: false, error: "Section bulunamadi." }, { status: 404 });
    }

    const result = await generateLlmText({
      systemPrompt:
        "You are a senior engineering editor. Correct only the provided section using the engineer note. Preserve technical rigor and Markdown structure.",
      userPrompt: [
        body.language === "tr"
          ? "Metni Turkce ve teknik olarak duzelt."
          : "Rewrite the section in English with technical accuracy.",
        "Mevcut Metin:",
        target.sectionContent,
        "",
        "Muhendis Notu:",
        body.engineerNote,
        "",
        "Lutfen notu dikkate alarak sadece bu bolumu yeniden yaz.",
      ].join("\n"),
      temperature: 0.15,
      maxOutputTokens: 1600,
      timeoutMs: 45000,
    });

    const refined = parseRefinedContent(result.text);

    await updateReportSectionContent({
      reportGroupId: body.reportGroupId,
      sectionKey: body.sectionKey,
      sectionContent: refined,
      lastEditedSource: "refined",
      reviewStatus: "reviewed",
    });

    return NextResponse.json({ success: true, sectionContent: refined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Section refine edilemedi.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
