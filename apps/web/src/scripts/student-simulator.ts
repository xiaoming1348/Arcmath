/**
 * Pre-pilot smoke test that simulates synthetic students answering live
 * problems and asserts the grading + hint pipeline behaves correctly.
 *
 * Goal: catch "basic path is broken" regressions BEFORE we put real
 * students and teachers on the platform. This is intentionally a thin
 * fixture-driven test — not a full QA suite, not a stress test, and
 * not an LLM-driven student. Each (problem × persona) combination
 * runs ~3–10 tRPC calls and asserts a small set of post-conditions.
 *
 * What it does NOT test:
 *  - SymPy / Lean step verification correctness in depth
 *    (covered separately by `benchmark-grader.ts` for proof problems)
 *  - End-to-end UI flows (those need the dev server, out of scope here)
 *  - Performance / concurrency
 *  - Hint quality (only that the endpoint returns non-empty text)
 *
 * Usage:
 *   bash scripts/with-env-local.sh \
 *     pnpm -C apps/web exec tsx src/scripts/student-simulator.ts
 *
 * Run-time: ~30s for the fixture matrix (≈8 problems × 4 personas).
 * No external API costs unless HINT_GUIDED hits the LLM hint tutor —
 * that path uses curated/precomputed hints first, so cost is usually
 * $0 on a freshly-seeded DB. Worst case ≈ $0.05.
 *
 * Exit code: 0 if all checks pass, 1 if any failed (mirrors
 * e2e-core-flow.ts so we can wire it into a future CI job).
 */
import bcrypt from "bcryptjs";
import { prisma } from "@arcmath/db";
import { withPepper } from "@/lib/password";
import { appRouter } from "@/lib/trpc/router";
import type { Session } from "next-auth";

const SMOKE_SLUG = "student-simulator-smoke";
const SMOKE_ADMIN_EMAIL = "sim.admin@student-simulator-smoke.arcmath.local";
const SMOKE_STUDENT_EMAIL = "sim.student@student-simulator-smoke.arcmath.local";

type CheckResult = { label: string; ok: boolean; detail?: string; persona?: string; problem?: string };
const results: CheckResult[] = [];

function check(label: string, ok: boolean, opts?: { detail?: string; persona?: string; problem?: string }) {
  const entry = { label, ok, detail: opts?.detail, persona: opts?.persona, problem: opts?.problem };
  results.push(entry);
  const tag = opts?.persona ? `[${opts.persona} on ${opts.problem ?? "?"}]` : "";
  if (ok) {
    console.log(`  OK   ${tag} ${label}`);
  } else {
    console.error(`  FAIL ${tag} ${label}${entry.detail ? ` — ${entry.detail}` : ""}`);
  }
}

// ---------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------

async function cleanup() {
  // Defensive cleanup — drop the smoke org + its members + any
  // attempts those users left behind. Nothing here touches real
  // school orgs.
  const existing = await prisma.organization.findUnique({
    where: { slug: SMOKE_SLUG },
    select: { id: true }
  });
  if (existing) {
    const memberUserIds = (
      await prisma.organizationMembership.findMany({
        where: { organizationId: existing.id },
        select: { userId: true }
      })
    ).map((m) => m.userId);
    if (memberUserIds.length > 0) {
      // Drop everything attached to these users so the next run starts
      // fresh. Don't drop ProblemSets because the simulator only
      // *reads* live problems, never creates them.
      await prisma.problemAttempt.deleteMany({ where: { userId: { in: memberUserIds } } });
      await prisma.practiceRun.deleteMany({ where: { userId: { in: memberUserIds } } });
    }
    await prisma.organization.delete({ where: { id: existing.id } });
    if (memberUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: memberUserIds } } });
    }
  }
  await prisma.user.deleteMany({ where: { email: { in: [SMOKE_ADMIN_EMAIL, SMOKE_STUDENT_EMAIL] } } });
}

async function setupOrgAndStudent(): Promise<{
  orgId: string;
  studentId: string;
}> {
  // bcrypt + pepper to match the real registration path, even though
  // no test ever calls /login here — this just keeps the User row
  // shape consistent with prod.
  const passwordHash = await bcrypt.hash(withPepper("simulator-smoke-pw"), 10);
  const adminPasswordHash = passwordHash;

  const org = await prisma.organization.create({
    data: {
      slug: SMOKE_SLUG,
      name: "Student Simulator Smoke",
      defaultLocale: "en"
    },
    select: { id: true }
  });

  const admin = await prisma.user.create({
    data: {
      email: SMOKE_ADMIN_EMAIL,
      name: "Sim Admin",
      role: "ADMIN",
      passwordHash: adminPasswordHash
    },
    select: { id: true }
  });

  await prisma.organizationMembership.create({
    data: {
      userId: admin.id,
      organizationId: org.id,
      role: "OWNER",
      status: "ACTIVE"
    }
  });

  const student = await prisma.user.create({
    data: {
      email: SMOKE_STUDENT_EMAIL,
      name: "Sim Student",
      role: "STUDENT",
      passwordHash
    },
    select: { id: true }
  });

  await prisma.organizationMembership.create({
    data: {
      userId: student.id,
      organizationId: org.id,
      role: "STUDENT",
      status: "ACTIVE"
    }
  });

  return { orgId: org.id, studentId: student.id };
}

function makeStudentCaller(studentId: string, orgId: string) {
  return appRouter.createCaller({
    session: {
      user: { id: studentId, email: SMOKE_STUDENT_EMAIL, name: "Sim Student", role: "STUDENT" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString()
    } as unknown as Session,
    prisma,
    membership: {
      organizationId: orgId,
      organizationName: "Student Simulator Smoke",
      organizationSlug: SMOKE_SLUG,
      role: "STUDENT" as const,
      userId: studentId
    }
  } as never);
}

// ---------------------------------------------------------------
// Fixture selection
// ---------------------------------------------------------------

type Fixture = {
  problemId: string;
  problemNumber: number;
  contestLabel: string;
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION" | "WORKED_SOLUTION" | "PROOF";
  canonicalAnswer: string | null;
  choices: unknown;
  problemSetId: string;
};

/** Pull a fixed batch of live problems we can simulate against.
 *
 * Selection criteria:
 *   - Must be in a REAL_EXAM problem set (so they're catalog-visible)
 *   - Must have a non-null answer for auto-graded formats
 *   - Coverage: at least one of each (MC, INTEGER, EXPRESSION,
 *     WORKED_SOLUTION). PROOF requires the proof-tutor's LLM
 *     dependencies — those are exercised by benchmark-grader.ts and
 *     skipped here to keep the simulator hermetic + cheap.
 */
async function selectFixtures(): Promise<Fixture[]> {
  // Hand-pick by contest+number for stability — random selection
  // would make failures harder to reproduce. These IDs resolve at
  // run time so the script doesn't break when problemSet IDs change.
  const wanted: Array<{ contest: string; year: number; exam: string | null; numbers: number[]; format: string }> = [
    { contest: "AMC8", year: 2023, exam: null, numbers: [1, 5, 10], format: "MULTIPLE_CHOICE" },
    { contest: "AMC10", year: 2023, exam: "A", numbers: [1, 5], format: "MULTIPLE_CHOICE" },
    { contest: "AIME", year: 2023, exam: "I", numbers: [1, 5], format: "INTEGER" },
    { contest: "EUCLID", year: 2024, exam: null, numbers: [1, 2], format: "MIXED" },
    // Putnam/USAMO are WORKED_SOLUTION → tested for "no auto-grade,
    // but the reveal-solution path doesn't crash". We pick one.
    { contest: "PUTNAM", year: 2024, exam: null, numbers: [1], format: "WORKED_SOLUTION" }
  ];

  const fixtures: Fixture[] = [];
  for (const want of wanted) {
    const set = await prisma.problemSet.findFirst({
      where: { contest: want.contest as never, year: want.year, exam: want.exam },
      select: { id: true, contest: true, year: true, exam: true }
    });
    if (!set) {
      console.warn(`  WARN: missing fixture set ${want.contest} ${want.year} ${want.exam ?? "-"}`);
      continue;
    }
    const problems = await prisma.problem.findMany({
      where: { problemSetId: set.id, number: { in: want.numbers } },
      select: {
        id: true,
        number: true,
        answer: true,
        answerFormat: true,
        choices: true
      }
    });
    for (const p of problems) {
      fixtures.push({
        problemId: p.id,
        problemNumber: p.number,
        contestLabel: `${set.contest} ${set.year}${set.exam ? " " + set.exam : ""}`,
        answerFormat: p.answerFormat,
        canonicalAnswer: p.answer,
        choices: p.choices,
        problemSetId: set.id
      });
    }
  }

  return fixtures;
}

// ---------------------------------------------------------------
// Persona behaviors
//
// Each persona reads the canonical answer and decides what to submit.
// All personas use the unified-attempt tRPC API end-to-end so the
// path matches what the real client does.
// ---------------------------------------------------------------

type Persona = "diligent" | "sloppy_format" | "confused" | "hint_addict";

function diligentAnswer(fixture: Fixture): string {
  return fixture.canonicalAnswer ?? "";
}

/** Right answer wrapped in cosmetic noise to test the normalizer. */
function sloppyAnswer(fixture: Fixture): string {
  const canonical = fixture.canonicalAnswer ?? "";
  if (fixture.answerFormat === "MULTIPLE_CHOICE") {
    return `(${canonical})`; // e.g. "(B)" instead of "B"
  }
  if (fixture.answerFormat === "INTEGER") {
    return ` +${canonical} `; // leading space + plus sign + trailing space
  }
  if (fixture.answerFormat === "EXPRESSION") {
    return `( ${canonical} )`; // outer parens + spaces
  }
  return canonical;
}

/** Obviously-wrong answer that is still well-formed for the grader. */
function confusedAnswer(fixture: Fixture): string {
  if (fixture.answerFormat === "MULTIPLE_CHOICE") {
    // Walk to a different valid label. Prefer "E" since canonical is
    // rarely E; fall back to "A" if canonical IS E.
    return fixture.canonicalAnswer === "E" ? "A" : "E";
  }
  if (fixture.answerFormat === "INTEGER") {
    return "0"; // integers in 0–999 range; 0 is rarely the answer
  }
  // EXPRESSION fallback: empty-ish bogus expression
  return "0";
}

// ---------------------------------------------------------------
// One persona × one fixture scenario.
// ---------------------------------------------------------------

async function runScenario(params: {
  persona: Persona;
  fixture: Fixture;
  studentCaller: ReturnType<typeof makeStudentCaller>;
}) {
  const { persona, fixture, studentCaller } = params;
  const tag = { persona, problem: `${fixture.contestLabel} #${fixture.problemNumber}` };

  // WORKED_SOLUTION problems short-circuit the grading path (the UI
  // hides the workspace and shows a reveal-solution panel). For the
  // simulator we just verify getState returns sensibly without 500.
  if (fixture.answerFormat === "WORKED_SOLUTION" || fixture.answerFormat === "PROOF") {
    try {
      await studentCaller.unifiedAttempt.getState({ problemId: fixture.problemId });
      check("getState OK on worked-solution problem", true, tag);
    } catch (err) {
      check("getState OK on worked-solution problem", false, {
        ...tag,
        detail: err instanceof Error ? err.message : String(err)
      });
    }
    return;
  }

  // ---- HINT_ADDICT path: HINT_GUIDED + 3 hints, then submit ----
  if (persona === "hint_addict") {
    let attemptId: string;
    try {
      const draft = (await studentCaller.unifiedAttempt.chooseEntry({
        problemId: fixture.problemId,
        entryMode: "HINT_GUIDED",
        selfReport: "NO_IDEA"
      })) as { attemptId: string };
      attemptId = draft.attemptId;
      check("hint-guided draft created", typeof attemptId === "string", tag);
    } catch (err) {
      check("hint-guided draft created", false, {
        ...tag,
        detail: err instanceof Error ? err.message : String(err)
      });
      return;
    }

    // Three hint requests in a row.
    for (let level = 1; level <= 3; level += 1) {
      try {
        const result = (await studentCaller.unifiedAttempt.requestHint({
          attemptId
        })) as { hint: { hintLevel: number; hintText: string }; exhausted: boolean };
        const hint = result.hint;
        check(`hint ${level} returns non-empty text`, typeof hint.hintText === "string" && hint.hintText.trim().length > 0, {
          ...tag,
          detail: `len=${hint.hintText?.length ?? 0}`
        });
        check(`hint ${level} reports correct level`, hint.hintLevel === level, tag);
      } catch (err) {
        check(`hint ${level} returns`, false, {
          ...tag,
          detail: err instanceof Error ? err.message : String(err)
        });
      }
    }

    // 4th hint should NOT crash — it should either return the last
    // hint again or a "no more hints" signal. Either is acceptable;
    // a 500 is not.
    try {
      await studentCaller.unifiedAttempt.requestHint({ attemptId });
      check("4th hint request does not throw", true, tag);
    } catch (err) {
      // BAD_REQUEST / TOO_MANY_REQUESTS is acceptable; INTERNAL_SERVER_ERROR is not.
      const msg = err instanceof Error ? err.message : String(err);
      const isBadRequest = msg.includes("BAD_REQUEST") || msg.includes("TOO_MANY") || msg.toLowerCase().includes("max");
      check("4th hint request is gracefully refused (not 500)", isBadRequest, { ...tag, detail: msg });
    }

    // Then submit the right answer to confirm hint flow doesn't break submit.
    try {
      const result = (await studentCaller.unifiedAttempt.submit({
        attemptId,
        finalAnswer: diligentAnswer(fixture)
      })) as { attempt?: { isCorrect: boolean } };
      check("post-hint submission graded", typeof result.attempt?.isCorrect === "boolean", tag);
      check("post-hint correct answer accepted", result.attempt?.isCorrect === true, {
        ...tag,
        detail: JSON.stringify(result).slice(0, 200)
      });
    } catch (err) {
      check("post-hint submission did not throw", false, {
        ...tag,
        detail: err instanceof Error ? err.message : String(err)
      });
    }
    return;
  }

  // ---- ANSWER_ONLY path for diligent / sloppy_format / confused ----
  let attemptId: string;
  try {
    const draft = (await studentCaller.unifiedAttempt.chooseEntry({
      problemId: fixture.problemId,
      entryMode: "ANSWER_ONLY",
      selfReport: "SOLVED_CONFIDENT"
    })) as { attemptId: string };
    attemptId = draft.attemptId;
    check("answer-only draft created", typeof attemptId === "string", tag);
  } catch (err) {
    check("answer-only draft created", false, {
      ...tag,
      detail: err instanceof Error ? err.message : String(err)
    });
    return;
  }

  const submission =
    persona === "diligent"
      ? diligentAnswer(fixture)
      : persona === "sloppy_format"
        ? sloppyAnswer(fixture)
        : confusedAnswer(fixture);

  let firstResult: { attempt?: { isCorrect: boolean; submittedAnswer?: string | null; normalizedAnswer?: string | null } };
  try {
    firstResult = (await studentCaller.unifiedAttempt.submit({
      attemptId,
      finalAnswer: submission
    })) as never;
    check("submit returned an attempt", !!firstResult.attempt, tag);
  } catch (err) {
    check("submit did not throw", false, {
      ...tag,
      detail: err instanceof Error ? err.message : String(err)
    });
    return;
  }

  // Outcome assertions per persona.
  if (persona === "diligent") {
    check("diligent: graded correct", firstResult.attempt?.isCorrect === true, {
      ...tag,
      detail: `submitted="${submission}" canonical="${fixture.canonicalAnswer}" normalized="${firstResult.attempt?.normalizedAnswer}"`
    });
  } else if (persona === "sloppy_format") {
    // Sloppy format SHOULD still grade correct — that's the whole
    // point of the normalizer. If this fails, the normalizer has a
    // bug or the canonical answer needs cleanup.
    check("sloppy_format: graded correct (normalizer absorbs cosmetic noise)", firstResult.attempt?.isCorrect === true, {
      ...tag,
      detail: `submitted="${submission}" canonical="${fixture.canonicalAnswer}" normalized="${firstResult.attempt?.normalizedAnswer}"`
    });
  } else if (persona === "confused") {
    check("confused: graded incorrect", firstResult.attempt?.isCorrect === false, {
      ...tag,
      detail: `submitted="${submission}" canonical="${fixture.canonicalAnswer}"`
    });
  }

  // Idempotence check: ask getState immediately after; the verdict
  // surfaced should match what submit returned. Catches "the DB
  // says one thing, submit returns another" desync bugs.
  try {
    const state = (await studentCaller.unifiedAttempt.getState({
      problemId: fixture.problemId
    })) as { attempt: { isCorrect: boolean | null; status: string } | null };
    check(
      "getState verdict matches submit verdict",
      state.attempt?.isCorrect === firstResult.attempt?.isCorrect,
      {
        ...tag,
        detail: `submit=${firstResult.attempt?.isCorrect} getState=${state.attempt?.isCorrect}`
      }
    );
  } catch (err) {
    check("getState after submit did not throw", false, {
      ...tag,
      detail: err instanceof Error ? err.message : String(err)
    });
  }
}

// ---------------------------------------------------------------
// Mode-upgrade smoke test (separate from persona loop because it's
// stateful: needs ANSWER_ONLY → STUCK_WITH_WORK transition).
// ---------------------------------------------------------------

async function runModeUpgradeSmoke(params: {
  fixture: Fixture;
  studentCaller: ReturnType<typeof makeStudentCaller>;
}) {
  const { fixture, studentCaller } = params;
  const tag = { problem: `${fixture.contestLabel} #${fixture.problemNumber}`, persona: "mode-upgrade" };

  if (fixture.answerFormat === "PROOF" || fixture.answerFormat === "WORKED_SOLUTION") {
    return;
  }

  let attemptId: string;
  try {
    const draft = (await studentCaller.unifiedAttempt.chooseEntry({
      problemId: fixture.problemId,
      entryMode: "ANSWER_ONLY",
      selfReport: "SOLVED_CONFIDENT"
    })) as { attemptId: string };
    attemptId = draft.attemptId;
  } catch (err) {
    check("upgrade: initial draft created", false, {
      ...tag,
      detail: err instanceof Error ? err.message : String(err)
    });
    return;
  }

  // Upgrade ANSWER_ONLY → STUCK_WITH_WORK ("I'll try writing steps now")
  try {
    await studentCaller.unifiedAttempt.upgradeMode({
      attemptId,
      entryMode: "STUCK_WITH_WORK"
    });
    check("upgrade: ANSWER_ONLY → STUCK_WITH_WORK accepted", true, tag);
  } catch (err) {
    check("upgrade: ANSWER_ONLY → STUCK_WITH_WORK accepted", false, {
      ...tag,
      detail: err instanceof Error ? err.message : String(err)
    });
    return;
  }

  // Add a single trivial step so the attempt has *some* work; we
  // don't care about verifier verdict for the smoke test.
  try {
    await studentCaller.unifiedAttempt.addStep({
      attemptId,
      latexInput: "1 + 1 = 2"
    });
    check("upgrade: addStep accepted post-upgrade", true, tag);
  } catch (err) {
    check("upgrade: addStep accepted post-upgrade", false, {
      ...tag,
      detail: err instanceof Error ? err.message : String(err)
    });
  }

  // Then confirm submit still works on the upgraded attempt.
  try {
    const result = (await studentCaller.unifiedAttempt.submit({
      attemptId,
      finalAnswer: diligentAnswer(fixture)
    })) as { attempt?: { isCorrect: boolean } };
    check("upgrade: submit after upgrade graded correct", result.attempt?.isCorrect === true, {
      ...tag,
      detail: JSON.stringify(result).slice(0, 200)
    });
  } catch (err) {
    check("upgrade: submit after upgrade did not throw", false, {
      ...tag,
      detail: err instanceof Error ? err.message : String(err)
    });
  }
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------

async function main(): Promise<void> {
  console.log("== Student Simulator (pre-pilot smoke test) ==\n");
  console.log("0. Cleanup any prior smoke run");
  await cleanup();

  console.log("\n1. Setup smoke org + student");
  const { orgId, studentId } = await setupOrgAndStudent();
  check("smoke org + student created", typeof orgId === "string" && typeof studentId === "string");

  console.log("\n2. Resolve fixture problems");
  const fixtures = await selectFixtures();
  console.log(`   Resolved ${fixtures.length} fixture problems:`);
  for (const f of fixtures) {
    console.log(`   - ${f.contestLabel} #${f.problemNumber} (${f.answerFormat}) answer=${f.canonicalAnswer}`);
  }
  check("at least 5 fixture problems resolved", fixtures.length >= 5, { detail: `got ${fixtures.length}` });

  const studentCaller = makeStudentCaller(studentId, orgId);

  console.log("\n3. Persona × fixture scenarios");
  const personas: Persona[] = ["diligent", "sloppy_format", "confused", "hint_addict"];
  for (const persona of personas) {
    console.log(`\n  -- persona: ${persona} --`);
    for (const fixture of fixtures) {
      await runScenario({ persona, fixture, studentCaller });
    }
  }

  console.log("\n4. Mode-upgrade smoke (ANSWER_ONLY → STUCK_WITH_WORK)");
  // Just the first MC fixture is enough — this is a path test, not
  // a coverage matrix. Skip if no MC fixture available.
  const mcFixture = fixtures.find((f) => f.answerFormat === "MULTIPLE_CHOICE");
  if (mcFixture) {
    await runModeUpgradeSmoke({ fixture: mcFixture, studentCaller });
  }

  console.log("\n5. Cleanup");
  await cleanup();

  // Report
  const passCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;
  console.log(`\n== Result: ${passCount} OK / ${failCount} FAIL ==`);
  if (failCount > 0) {
    console.log("\nFailures:");
    for (const r of results.filter((x) => !x.ok)) {
      const tag = r.persona ? `[${r.persona} on ${r.problem ?? "?"}]` : "";
      console.log(`  - ${tag} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }

  await prisma.$disconnect();
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch(async (error: unknown) => {
  console.error("Simulator crashed:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
