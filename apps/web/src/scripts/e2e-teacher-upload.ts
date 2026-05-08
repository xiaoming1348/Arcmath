/**
 * End-to-end smoke test for the teacher-upload pipeline.
 *
 * What it proves:
 *   1. The arcmath-problem-set-v1 fixture parses without errors.
 *   2. commitTeacherImportFromJson inserts ProblemSet + Problem rows,
 *      and flags PROOF rows as PENDING for preprocess.
 *   3. preprocessProblems() processes those PROOF rows in parallel
 *      and writes milestone-checks recipes. (Lean /prove is skipped
 *      when PROOF_VERIFIER_URL is unset — the solution-only path.)
 *   4. Result: each PROOF row ends up with milestoneChecks populated
 *      and formalizedStatus in {VERIFIED, MANUAL_REVIEW, FAILED}.
 *
 * Run via:
 *   bash scripts/with-env-local.sh node --import tsx \
 *     apps/web/src/scripts/e2e-teacher-upload.ts
 *
 * Requires OPENAI_API_KEY. Designed to be idempotent — re-running it
 * uses a time-stamped title so it creates a fresh ProblemSet each time.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@arcmath/db";
import { commitTeacherImportFromJson } from "../lib/imports/teacher-import";
import { preprocessProblems } from "../lib/preprocessing";

async function main() {
  const fixturePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures/teacher-homework-example.json"
  );
  const raw = await fs.readFile(fixturePath, "utf-8");
  const parsed = JSON.parse(raw) as { set: { title: string }; schemaVersion: string };
  // Make the title unique per run so we don't clash across runs.
  const stamped = { ...parsed, set: { ...parsed.set, title: `${parsed.set.title} [e2e-${Date.now()}]` } };
  const jsonText = JSON.stringify(stamped);

  // Ensure an admin user exists. We don't care about auth here, just
  // the FK constraint on ImportJob.uploadedByUserId.
  let admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true }
  });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: `e2e-admin-${Date.now()}@arcmath.local`,
        name: "E2E Admin",
        role: "ADMIN",
        // Unusable hash — this admin user is only used so the ImportJob
        // FK resolves; nobody logs in with it.
        passwordHash: "e2e-no-login"
      },
      select: { id: true, email: true }
    });
    console.log(`[e2e] created admin user ${admin.email}`);
  } else {
    console.log(`[e2e] using existing admin ${admin.email}`);
  }

  console.log(`[e2e] committing fixture: ${stamped.set.title}`);
  const started = Date.now();
  const commitResult = await commitTeacherImportFromJson({
    prisma,
    jsonText,
    filename: "e2e-teacher-homework.json",
    uploadedByUserId: admin.id
  });
  console.log(`[e2e] commit result:`, {
    problemSetId: commitResult.problemSetId,
    created: commitResult.createdProblems,
    updated: commitResult.updatedProblems,
    skipped: commitResult.skippedProblems,
    pendingPreprocessCount: commitResult.pendingPreprocessProblemIds.length
  });

  if (commitResult.pendingPreprocessProblemIds.length === 0) {
    console.log("[e2e] no PROOF problems queued — skipping preprocess step.");
    await prisma.$disconnect();
    return;
  }

  // Default to solution-only unless ARCMATH_E2E_WITH_LEAN=1. The fast
  // path (recipe-only) is what the teacher-upload commit mutation
  // actually uses in production when PROOF_VERIFIER_URL isn't set, and
  // it's the one whose speed we care about for the 3-min/20-problem target.
  const solutionOnly =
    process.env.ARCMATH_E2E_WITH_LEAN === "1" ? false : true;
  console.log(
    `[e2e] running preprocess on ${commitResult.pendingPreprocessProblemIds.length} PROOF problems (concurrency=4, solution-only=${solutionOnly})...`
  );
  const preStart = Date.now();
  const summary = await preprocessProblems({
    problemIds: commitResult.pendingPreprocessProblemIds,
    concurrency: 4,
    options: { solutionOnly },
    onProblemDone: (id, outcome) => {
      console.log(`  [preprocess] ${id} → ${outcome}`);
    }
  });
  const preElapsed = ((Date.now() - preStart) / 1000).toFixed(1);
  console.log(`[e2e] preprocess done in ${preElapsed}s`, summary);

  // Verify: read back and make sure every PROOF row has milestoneChecks.
  const proofRows = await prisma.problem.findMany({
    where: { problemSetId: commitResult.problemSetId, answerFormat: "PROOF" },
    select: {
      id: true,
      number: true,
      formalizedStatus: true,
      milestoneChecks: true,
      formalizedReason: true
    },
    orderBy: { number: "asc" }
  });

  console.log("");
  console.log("[e2e] final PROOF rows:");
  let successes = 0;
  for (const row of proofRows) {
    const hasRecipe = row.milestoneChecks !== null && row.milestoneChecks !== undefined;
    const steps =
      hasRecipe &&
      typeof row.milestoneChecks === "object" &&
      row.milestoneChecks !== null &&
      "steps" in row.milestoneChecks &&
      Array.isArray((row.milestoneChecks as { steps: unknown }).steps)
        ? ((row.milestoneChecks as { steps: unknown[] }).steps.length as number)
        : 0;
    const ok = hasRecipe && steps > 0;
    if (ok) successes += 1;
    console.log(
      `  #${row.number}: status=${row.formalizedStatus}  recipe=${hasRecipe ? `yes (${steps} step)` : "no"}` +
        (row.formalizedReason ? `  reason=${row.formalizedReason.slice(0, 80)}` : "")
    );
  }

  const totalElapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log("");
  console.log(
    `[e2e] PROOF rows with recipe: ${successes}/${proofRows.length}  — total elapsed: ${totalElapsed}s`
  );
  if (successes !== proofRows.length) {
    console.error("[e2e] FAIL — not every PROOF problem got a recipe");
    process.exitCode = 1;
  } else {
    console.log("[e2e] PASS ✅");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
