import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";

/**
 * POST /api/practice-runs/[runId]/save-draft
 *
 * Per-problem draft save for the Canvas-style exam workspace. The
 * student picks an answer for one problem, clicks Save, and we upsert
 * a DRAFT ProblemAttempt row.
 *
 * Why a thin endpoint vs. a server action: the canvas UX expects the
 * Save click to feel snappy. A server action triggers a full RSC
 * payload + re-render; this endpoint just writes one row and returns
 * the attempt id. The page re-render only happens on whole-set submit.
 *
 * Idempotency / shape:
 *   - One DRAFT per (run, problem, user). If a previous DRAFT exists,
 *     update it. The unique constraint enforced by the @@index on
 *     (userId, problemId, status, updatedAt) doesn't make this a true
 *     upsert, so we do find-then-update / create explicitly.
 *   - SUBMITTED attempts are left alone — once submitted, you can't
 *     overwrite from canvas. Restart-over (separate flow) is the way.
 *
 * Body: { problemId: string, answer: string }
 *
 * Response: { ok: true, attemptId: string }
 */
export const runtime = "nodejs";

type Body = {
  problemId?: unknown;
  answer?: unknown;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { runId } = await params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const problemId =
    typeof body.problemId === "string" ? body.problemId : null;
  const rawAnswer = typeof body.answer === "string" ? body.answer : "";

  if (!problemId) {
    return NextResponse.json(
      { error: "problemId is required" },
      { status: 400 }
    );
  }

  // Validate the run belongs to the caller and isn't already completed.
  // We DO NOT pull mode here — saving a draft is allowed in both Mock
  // and Practice; the distinction only matters for hint access.
  const run = await prisma.practiceRun.findFirst({
    where: { id: runId, userId, completedAt: null },
    select: { id: true, problemSetId: true }
  });
  if (!run) {
    return NextResponse.json(
      { error: "Run not found or already completed" },
      { status: 404 }
    );
  }

  // Confirm the problem belongs to this run's set so a forged problemId
  // can't write attempts against an unrelated problem.
  const problem = await prisma.problem.findFirst({
    where: { id: problemId, problemSetId: run.problemSetId },
    select: { id: true }
  });
  if (!problem) {
    return NextResponse.json(
      { error: "Problem not in this set" },
      { status: 404 }
    );
  }

  const existingDraft = await prisma.problemAttempt.findFirst({
    where: {
      userId,
      problemId,
      practiceRunId: runId,
      status: "DRAFT"
    },
    select: { id: true }
  });

  const submittedAnswer = rawAnswer.trim() || null;

  if (existingDraft) {
    await prisma.problemAttempt.update({
      where: { id: existingDraft.id },
      data: {
        submittedAnswer,
        // Don't grade until whole-set submit. isCorrect stays false until
        // then.
        isCorrect: false
      }
    });
    return NextResponse.json({ ok: true, attemptId: existingDraft.id });
  }

  const created = await prisma.problemAttempt.create({
    data: {
      userId,
      problemId,
      practiceRunId: runId,
      submittedAnswer,
      isCorrect: false,
      status: "DRAFT",
      entryMode: "ANSWER_ONLY"
    },
    select: { id: true }
  });
  return NextResponse.json({ ok: true, attemptId: created.id });
}
