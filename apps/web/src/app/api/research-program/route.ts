import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_RESEARCH_PROFILE,
  buildResearchProgram,
  type ResearchProgramProfile
} from "@/lib/research-program";

export async function GET() {
  return NextResponse.json(buildResearchProgram(DEFAULT_RESEARCH_PROFILE));
}

export async function POST(request: NextRequest) {
  let body: Partial<ResearchProgramProfile>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 }
    );
  }

  return NextResponse.json(buildResearchProgram(body));
}
