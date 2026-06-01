import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { getActiveOrganizationMembership } from "@/lib/organizations";

/**
 * POST /api/practice-runs/start-real-exam
 *
 * Creates a new PracticeRun for a real-exam set with an explicit
 * Mock/Practice mode choice. Used by the chooser UI shown on the
 * problem-set page when the student opens a real-exam set without
 * a live run.
 *
 * Mode semantics:
 *   - MOCK     = simulated exam (no hints, no real-time step feedback).
 *   - PRACTICE = normal Arcmath workflow (hints + step mentor on).
 *
 * Idempotency: if a live run already exists for (user, set), we DO NOT
 * overwrite the mode — we return the existing run as-is. Switching mode
 * mid-run requires Start over, which is its own destructive endpoint.
 *
 * Auth: must be logged in.
 *
 * Body: { problemSetId: string, mode: "MOCK" | "PRACTICE" }
 *
 * Response: { ok: true, runId: string, mode: "MOCK" | "PRACTICE" }
 */
export const runtime = "nodejs";

type Body = {
  problemSetId?: unknown;
  mode?: unknown;
};

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const problemSetId =
    typeof body.problemSetId === "string" ? body.problemSetId : null;
  const mode =
    body.mode === "MOCK" || body.mode === "PRACTICE" ? body.mode : null;

  if (!problemSetId || !mode) {
    return NextResponse.json(
      { error: "problemSetId and mode (MOCK|PRACTICE) are required" },
      { status: 400 }
    );
  }

  // Verify the set exists AND is a real-exam set. Mock/Practice mode is
  // only meaningful for real-exam sets; topic-mix and diagnostic flows
  // shouldn't be calling this endpoint at all.
  const set = await prisma.problemSet.findUnique({
    where: { id: problemSetId },
    select: { id: true, category: true }
  });
  if (!set || set.category !== "REAL_EXAM") {
    return NextResponse.json(
      { error: "Set is not a real-exam set" },
      { status: 400 }
    );
  }

  // Org context for the new run, if the student has an active org.
  const membership = await getActiveOrganizationMembership(
    prisma,
    session.user.id
  );

  // Idempotency: prefer an existing live run; only create when absent.
  const existing = await prisma.practiceRun.findFirst({
    where: {
      userId: session.user.id,
      problemSetId,
      organizationId: membership?.organizationId ?? null,
      completedAt: null
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, mode: true }
  });

  if (existing) {
    return NextResponse.json({
      ok: true,
      runId: existing.id,
      mode: existing.mode ?? "PRACTICE"
    });
  }

  const created = await prisma.practiceRun.create({
    data: {
      userId: session.user.id,
      problemSetId,
      organizationId: membership?.organizationId ?? null,
      mode
    },
    select: { id: true, mode: true }
  });

  return NextResponse.json({
    ok: true,
    runId: created.id,
    mode: created.mode ?? mode
  });
}
