import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";

/**
 * DELETE /api/problems/[problemId]/attempts/restart
 *
 * Wipes the caller's prior attempts (DRAFT + SUBMITTED) on the given
 * problem so the next time they open it they get a clean slate.
 * Backs the "Start over" button on the problem-set page.
 *
 * Cascading semantics (from schema):
 *   - ProblemAttempt → AttemptStep      : DB-level CASCADE (rows go away)
 *   - ProblemAttempt → ProblemHintUsage : DB-level SET NULL on attemptId
 *     (we keep the usage row for global telemetry; the orphan attemptId
 *      pointer is harmless)
 *   - OcrCallLog.problemAttemptId is a nullable column with no FK
 *     constraint, so it becomes a dangling id; we leave it (telemetry
 *     uses it only for cross-correlation, not joins that would explode)
 *
 * Auth: must be logged in. We don't gate on org membership — anyone
 * can restart their OWN attempts on any problem they can access.
 *
 * Tenancy: we filter the DELETE by `userId = caller.id` so even if a
 * problemId is passed that belongs to another org's private set, the
 * caller can only nuke their own rows. There's no path to delete
 * someone else's attempts here.
 *
 * Response: { ok: true, deleted: number } on success.
 */
export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { problemId } = await params;

  // We could also confirm the problem exists, but that's an unnecessary
  // round trip — if the id is bogus the deleteMany just affects 0 rows
  // and returns ok with deleted=0. No data integrity issue either way.
  const result = await prisma.problemAttempt.deleteMany({
    where: {
      userId: session.user.id,
      problemId
    }
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
