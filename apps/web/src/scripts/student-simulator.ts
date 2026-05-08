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
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@arcmath/db";
import { withPepper } from "@/lib/password";
import { appRouter } from "@/lib/trpc/router";
import type { Session } from "next-auth";

const SMOKE_SLUG = "student-simulator-smoke";
const SMOKE_ADMIN_EMAIL = "sim.admin@student-simulator-smoke.arcmath.local";
const SMOKE_STUDENT_EMAIL = "sim.student@student-simulator-smoke.arcmath.local";

type CheckResult = { label: string; ok: boolean; detail?: string; persona?: string; problem?: string };
const results: CheckResult[] = [];

// Per-scenario row that ends up in the human-readable test table at
// the end of the run. We push one row per (persona × fixture) combo.
type ScenarioRow = {
  contest: string;
  problemNumber: number;
  answerFormat: string;
  persona: string;
  mode: string;
  submitted: string;
  canonical: string;
  normalized: string;
  expectedCorrect: boolean | null;
  actualCorrect: boolean | null;
  passed: boolean;
  feedbackPreview: string;
  hintsCount: number;
  notes: string;
};
const scenarioRows: ScenarioRow[] = [];

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

/** Truncate + escape a string for inclusion in a markdown table cell. */
function cellEscape(value: string | null | undefined, maxLen = 80): string {
  if (value === null || value === undefined) return "—";
  const oneLine = String(value).replace(/\s+/g, " ").trim();
  const truncated = oneLine.length > maxLen ? oneLine.slice(0, maxLen - 1) + "…" : oneLine;
  // Escape pipes so the markdown table doesn't break.
  return truncated.replace(/\|/g, "\\|");
}

async function runScenario(params: {
  persona: Persona;
  fixture: Fixture;
  studentCaller: ReturnType<typeof makeStudentCaller>;
}) {
  const { persona, fixture, studentCaller } = params;
  const tag = { persona, problem: `${fixture.contestLabel} #${fixture.problemNumber}` };

  // Per-scenario row that ends up in the report. Filled progressively
  // so we can still emit a row when the scenario short-circuits.
  const row: ScenarioRow = {
    contest: fixture.contestLabel,
    problemNumber: fixture.problemNumber,
    answerFormat: fixture.answerFormat,
    persona,
    mode: "—",
    submitted: "—",
    canonical: fixture.canonicalAnswer ?? "—",
    normalized: "—",
    expectedCorrect: null,
    actualCorrect: null,
    passed: false,
    feedbackPreview: "",
    hintsCount: 0,
    notes: ""
  };
  const recordRow = (scenarioPassed: boolean, extraNotes?: string) => {
    row.passed = scenarioPassed;
    if (extraNotes) row.notes = (row.notes ? row.notes + "; " : "") + extraNotes;
    scenarioRows.push(row);
  };

  // PROOF problems still short-circuit (proof-tutor is exercised by
  // benchmark-grader.ts elsewhere). WORKED_SOLUTION USED to live in
  // this branch too, but Putnam students DO want hints — and a prior
  // regression had us throwing BAD_REQUEST on every hint click. The
  // hint_addict persona below now exercises WORKED_SOLUTION end-to-
  // end so we'd catch that again.
  if (fixture.answerFormat === "PROOF") {
    row.mode = "REVEAL_SOLUTION";
    row.submitted = "(no auto-grade path)";
    try {
      await studentCaller.unifiedAttempt.getState({ problemId: fixture.problemId });
      check("getState OK on proof problem", true, tag);
      recordRow(true, "PROOF: only verifies getState doesn't crash");
    } catch (err) {
      check("getState OK on proof problem", false, {
        ...tag,
        detail: err instanceof Error ? err.message : String(err)
      });
      recordRow(false, "getState threw");
    }
    return;
  }

  // ---- HINT_ADDICT path: HINT_GUIDED + 3 hints, then submit ----
  if (persona === "hint_addict") {
    row.mode = "HINT_GUIDED";
    let scenarioOk = true;
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
      recordRow(false, "draft creation threw");
      return;
    }

    // Three hint requests in a row. Capture each hint's text into
    // the report so the user can see what the tutor actually said.
    const hintTexts: string[] = [];
    for (let level = 1; level <= 3; level += 1) {
      try {
        const result = (await studentCaller.unifiedAttempt.requestHint({
          attemptId
        })) as { hint: { hintLevel: number; hintText: string }; exhausted: boolean };
        const hint = result.hint;
        const nonEmpty = typeof hint.hintText === "string" && hint.hintText.trim().length > 0;
        check(`hint ${level} returns non-empty text`, nonEmpty, {
          ...tag,
          detail: `len=${hint.hintText?.length ?? 0}`
        });
        check(`hint ${level} reports correct level`, hint.hintLevel === level, tag);
        if (!nonEmpty || hint.hintLevel !== level) scenarioOk = false;
        hintTexts.push(hint.hintText);
      } catch (err) {
        check(`hint ${level} returns`, false, {
          ...tag,
          detail: err instanceof Error ? err.message : String(err)
        });
        scenarioOk = false;
      }
    }
    row.hintsCount = hintTexts.length;
    // Show the first hint as a preview (the most-likely-most-useful
    // for a student).
    if (hintTexts.length > 0) row.feedbackPreview = `hint1: ${hintTexts[0]}`;

    // 4th hint should NOT crash — it should either return the last
    // hint again or a "no more hints" signal. Either is acceptable;
    // a 500 is not.
    try {
      await studentCaller.unifiedAttempt.requestHint({ attemptId });
      check("4th hint request does not throw", true, tag);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isBadRequest = msg.includes("BAD_REQUEST") || msg.includes("TOO_MANY") || msg.toLowerCase().includes("max");
      check("4th hint request is gracefully refused (not 500)", isBadRequest, { ...tag, detail: msg });
      if (!isBadRequest) scenarioOk = false;
    }

    // Then submit to confirm hint flow doesn't break submit. For
    // WORKED_SOLUTION problems with no canonical scalar answer (Putnam
    // proof problems), submit a placeholder string so the server
    // accepts the request (ANSWER_ONLY mode requires SOMETHING) and
    // then verify the attempt was recorded as ungraded — NOT as
    // "correct", because the server doesn't auto-grade WORKED_SOLUTION.
    const isUngraded = fixture.answerFormat === "WORKED_SOLUTION";
    const hasScalarAnswer = (fixture.canonicalAnswer ?? "").length > 0;
    const submission = hasScalarAnswer
      ? diligentAnswer(fixture)
      : "(placeholder; this problem has no scalar answer)";
    row.submitted = submission;
    row.expectedCorrect = isUngraded ? null : true;
    try {
      const result = (await studentCaller.unifiedAttempt.submit({
        attemptId,
        finalAnswer: submission
      })) as { attempt?: { isCorrect: boolean; normalizedAnswer?: string | null } };
      check("post-hint submission graded", typeof result.attempt?.isCorrect === "boolean", tag);
      row.actualCorrect = result.attempt?.isCorrect ?? null;
      row.normalized = result.attempt?.normalizedAnswer ?? "—";
      if (isUngraded) {
        // WORKED_SOLUTION: verdict is always `false` because the server
        // skips gradeAnswer. We just confirm submit returned without
        // throwing; the UI surfaces this as "ungraded".
        if (typeof result.attempt?.isCorrect !== "boolean") scenarioOk = false;
      } else {
        const correct = result.attempt?.isCorrect === true;
        check("post-hint correct answer accepted", correct, {
          ...tag,
          detail: JSON.stringify(result).slice(0, 200)
        });
        if (!correct) scenarioOk = false;
      }
    } catch (err) {
      check("post-hint submission did not throw", false, {
        ...tag,
        detail: err instanceof Error ? err.message : String(err)
      });
      scenarioOk = false;
    }
    recordRow(scenarioOk);
    return;
  }

  // ---- ANSWER_ONLY path for diligent / sloppy_format / confused ----
  // Skip diligent + sloppy_format on WORKED_SOLUTION fixtures with no
  // canonical scalar answer — there's nothing to "correctly answer"
  // against, so the assertions about grading verdict are meaningless.
  // confused still runs (any non-empty wrong-looking answer should
  // round-trip without crashing, even if not auto-graded).
  const isUngraded = fixture.answerFormat === "WORKED_SOLUTION";
  const hasScalarAnswer = (fixture.canonicalAnswer ?? "").length > 0;
  if (isUngraded && !hasScalarAnswer && persona !== "confused") {
    row.mode = "ANSWER_ONLY";
    row.submitted = "(skipped: WORKED_SOLUTION with no scalar answer)";
    recordRow(true, "diligent/sloppy_format skipped — no canonical answer to test against");
    return;
  }

  row.mode = "ANSWER_ONLY";
  let scenarioOk = true;
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
    recordRow(false, "draft creation threw");
    return;
  }

  const submission =
    persona === "diligent"
      ? diligentAnswer(fixture)
      : persona === "sloppy_format"
        ? sloppyAnswer(fixture)
        : confusedAnswer(fixture);
  row.submitted = submission;
  // For WORKED_SOLUTION there's no auto-grade, so "expected correct"
  // is unknowable.
  row.expectedCorrect = isUngraded ? null : persona !== "confused";

  let firstResult: { attempt?: { isCorrect: boolean; submittedAnswer?: string | null; normalizedAnswer?: string | null; explanationText?: string | null; overallFeedback?: string | null } };
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
    recordRow(false, "submit threw");
    return;
  }

  row.actualCorrect = firstResult.attempt?.isCorrect ?? null;
  row.normalized = firstResult.attempt?.normalizedAnswer ?? "—";
  row.feedbackPreview = firstResult.attempt?.explanationText ?? firstResult.attempt?.overallFeedback ?? "";

  // Outcome assertions per persona.
  if (isUngraded) {
    // WORKED_SOLUTION: server doesn't auto-grade; we just assert the
    // submit returned an attempt object. Verdict will always be
    // false, normalizedAnswer will be null — that's correct behavior.
    if (typeof firstResult.attempt?.isCorrect !== "boolean") scenarioOk = false;
  } else if (persona === "diligent") {
    const ok = firstResult.attempt?.isCorrect === true;
    check("diligent: graded correct", ok, {
      ...tag,
      detail: `submitted="${submission}" canonical="${fixture.canonicalAnswer}" normalized="${firstResult.attempt?.normalizedAnswer}"`
    });
    if (!ok) scenarioOk = false;
  } else if (persona === "sloppy_format") {
    const ok = firstResult.attempt?.isCorrect === true;
    check("sloppy_format: graded correct (normalizer absorbs cosmetic noise)", ok, {
      ...tag,
      detail: `submitted="${submission}" canonical="${fixture.canonicalAnswer}" normalized="${firstResult.attempt?.normalizedAnswer}"`
    });
    if (!ok) scenarioOk = false;
  } else if (persona === "confused") {
    const ok = firstResult.attempt?.isCorrect === false;
    check("confused: graded incorrect", ok, {
      ...tag,
      detail: `submitted="${submission}" canonical="${fixture.canonicalAnswer}"`
    });
    if (!ok) scenarioOk = false;
  }

  // Idempotence check: getState verdict must match submit verdict.
  try {
    const state = (await studentCaller.unifiedAttempt.getState({
      problemId: fixture.problemId
    })) as { attempt: { isCorrect: boolean | null; status: string } | null };
    const matches = state.attempt?.isCorrect === firstResult.attempt?.isCorrect;
    check("getState verdict matches submit verdict", matches, {
      ...tag,
      detail: `submit=${firstResult.attempt?.isCorrect} getState=${state.attempt?.isCorrect}`
    });
    if (!matches) scenarioOk = false;
  } catch (err) {
    check("getState after submit did not throw", false, {
      ...tag,
      detail: err instanceof Error ? err.message : String(err)
    });
    scenarioOk = false;
  }

  recordRow(scenarioOk);
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

  // ---- Per-scenario test table ----
  // The OK/FAIL list above is great for CI but useless for "show me
  // what the student saw". This block emits a markdown table where
  // each row is one (persona × problem) scenario with the actual
  // input + verdict + feedback so a human (you) can scan it.
  console.log("\n6. Per-scenario test table\n");
  const tableHeader = "| Set | # | Format | Persona | Mode | Submitted | Canonical | Normalized | Expect | Actual | Hints | Feedback | ✓ |";
  const tableSep = "|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const tableRows = scenarioRows.map((row) => {
    const expect =
      row.expectedCorrect === null ? "—" : row.expectedCorrect ? "correct" : "incorrect";
    const actual =
      row.actualCorrect === null ? "—" : row.actualCorrect ? "correct" : "incorrect";
    return [
      cellEscape(row.contest, 24),
      String(row.problemNumber),
      cellEscape(row.answerFormat, 14),
      cellEscape(row.persona, 14),
      cellEscape(row.mode, 18),
      cellEscape(row.submitted, 30),
      cellEscape(row.canonical, 24),
      cellEscape(row.normalized, 24),
      expect,
      actual,
      row.hintsCount === 0 ? "—" : String(row.hintsCount),
      cellEscape(row.feedbackPreview || "—", 80),
      row.passed ? "✓" : "✗"
    ].join(" | ");
  });
  const markdownTable = [tableHeader, tableSep, ...tableRows.map((r) => `| ${r} |`)].join("\n");
  console.log(markdownTable);

  // Write the report (markdown + JSON) to disk so you can scroll it
  // independently of the terminal buffer.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir = path.resolve(process.cwd(), "tmp");
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.resolve(reportDir, `student-simulator-report-${stamp}.md`);
  const jsonPath = path.resolve(reportDir, `student-simulator-report-${stamp}.json`);

  // Compose the full markdown report.
  const passCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;
  const scenarioPass = scenarioRows.filter((r) => r.passed).length;
  const scenarioFail = scenarioRows.filter((r) => !r.passed).length;
  const reportLines: string[] = [];
  reportLines.push(`# Student-Simulator Report — ${new Date().toISOString()}`);
  reportLines.push("");
  reportLines.push(`Assertion summary: **${passCount} OK / ${failCount} FAIL**`);
  reportLines.push(`Scenario summary: **${scenarioPass} pass / ${scenarioFail} fail** (over ${scenarioRows.length} scenarios)`);
  reportLines.push("");
  reportLines.push("## Per-scenario table");
  reportLines.push("");
  reportLines.push(markdownTable);
  if (failCount > 0) {
    reportLines.push("");
    reportLines.push("## Failures (assertion-level)");
    reportLines.push("");
    for (const r of results.filter((x) => !x.ok)) {
      const tag = r.persona ? `[${r.persona} on ${r.problem ?? "?"}]` : "";
      reportLines.push(`- ${tag} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }
  await writeFile(reportPath, reportLines.join("\n") + "\n", "utf8");
  await writeFile(
    jsonPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), passCount, failCount, scenarios: scenarioRows, assertions: results }, null, 2) + "\n",
    "utf8"
  );

  console.log(`\n== Result: ${passCount} OK / ${failCount} FAIL (${scenarioPass}/${scenarioRows.length} scenarios passed) ==`);
  console.log(`Markdown report: ${reportPath}`);
  console.log(`JSON report:     ${jsonPath}`);
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
