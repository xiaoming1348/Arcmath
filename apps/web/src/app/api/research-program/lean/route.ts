import { NextRequest, NextResponse } from "next/server";
import {
  explainLeanProof,
  getResearchLeanHealth,
  leanDraftToFinal,
  naturalLanguageToLeanDraft,
  proveNaturalStatement,
  researchLeanActionSchema,
  verifyLeanCode
} from "@/lib/research-mode-lean";

export async function GET() {
  return NextResponse.json(await getResearchLeanHealth());
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 }
    );
  }

  const parsed = researchLeanActionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid Research Mode Lean action.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }

  try {
    const input = parsed.data;
    if (input.action === "health") {
      return NextResponse.json(await getResearchLeanHealth());
    }
    if (input.action === "nl_to_lean_draft") {
      return NextResponse.json(
        await naturalLanguageToLeanDraft({
          domain: input.domain,
          naturalLanguageStatement: input.naturalLanguageStatement,
          plannerAssumptions: input.plannerAssumptions,
          openaiModel: input.openaiModel
        })
      );
    }
    if (input.action === "lean_draft_to_final") {
      return NextResponse.json(
        await leanDraftToFinal({
          leanDraft: input.leanDraft,
          openaiModel: input.openaiModel
        })
      );
    }
    if (input.action === "verify_lean") {
      return NextResponse.json(await verifyLeanCode(input.leanCode));
    }
    if (input.action === "prove") {
      return NextResponse.json(
        await proveNaturalStatement({
          domain: input.domain,
          naturalLanguageStatement: input.naturalLanguageStatement,
          plannerAssumptions: input.plannerAssumptions,
          maxCompletionRetries: input.maxCompletionRetries,
          openaiModel: input.openaiModel
        })
      );
    }
    return NextResponse.json(
      await explainLeanProof({
        leanCode: input.leanCode,
        naturalLanguageStatement: input.naturalLanguageStatement,
        language: input.language
      })
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 502 }
    );
  }
}
