/**
 * End-to-end smoke test of the unified attempt flows:
 *   1. ANSWER_ONLY (integer problem, confident answer → graded)
 *   2. STUCK_WITH_WORK (integer problem, steps + optional answer → batch verify + grade)
 *   3. HINT_GUIDED (integer problem, take hints, upgrade to answer)
 *   4. PROOF_STEPS (proof problem, steps-only → batch verify + overall review)
 */

import { CookieJar } from "tough-cookie";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL ?? "northstar.student1@arcmath.local";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "Trial2026Pass";
const INTEGER_PROBLEM_ID = process.env.SMOKE_INTEGER_PROBLEM_ID ?? "cmo5qhvt80001af2sen4m92ga";
const PROOF_PROBLEM_ID = process.env.SMOKE_PROOF_PROBLEM_ID ?? "cmo5beb0b0002oy5ai68pdh6j";

type Json = Record<string, unknown>;

async function jarFetch(jar: CookieJar, url: string, init?: RequestInit): Promise<Response> {
  const h = new Headers(init?.headers ?? {});
  const c = await jar.getCookieString(url);
  if (c) h.set("cookie", c);
  const r = await fetch(url, { ...init, headers: h, redirect: "manual" });
  for (const sc of r.headers.getSetCookie?.() ?? []) await jar.setCookie(sc, url).catch(() => {});
  return r;
}

async function login(jar: CookieJar): Promise<void> {
  const { csrfToken } = (await (await jarFetch(jar, `${BASE}/api/auth/csrf`)).json()) as { csrfToken: string };
  await jarFetch(jar, `${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      email: EMAIL,
      password: PASSWORD,
      json: "true",
      callbackUrl: BASE
    }).toString()
  });
}

async function tQuery(jar: CookieJar, path: string, input: Json): Promise<Json> {
  const params = new URLSearchParams({ input: JSON.stringify(input) });
  const res = await jarFetch(jar, `${BASE}/api/trpc/${path}?${params}`);
  return (await res.json()) as Json;
}

async function tMutate(jar: CookieJar, path: string, input: Json): Promise<Json> {
  const res = await jarFetch(jar, `${BASE}/api/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status} ${text}`);
  }
  return JSON.parse(text) as Json;
}

function extract<T>(r: Json): T {
  return ((r.result as Json)?.data as T);
}

function colour(v: string): string {
  const map: Record<string, string> = {
    VERIFIED: "\x1b[32m",
    PLAUSIBLE: "\x1b[33m",
    UNKNOWN: "\x1b[2m",
    INVALID: "\x1b[31m",
    ERROR: "\x1b[31m",
    PENDING: "\x1b[2m",
    "✓": "\x1b[32m",
    "✗": "\x1b[31m"
  };
  return `${map[v] ?? ""}${v}\x1b[0m`;
}

async function resetProblemAttempts(jar: CookieJar, problemId: string): Promise<void> {
  await tMutate(jar, "unifiedAttempt.startNewAttempt", { problemId });
}

async function runAnswerOnly(jar: CookieJar) {
  console.log("\n=== Flow 1: ANSWER_ONLY ===");
  await resetProblemAttempts(jar, INTEGER_PROBLEM_ID);
  await tMutate(jar, "unifiedAttempt.chooseEntry", {
    problemId: INTEGER_PROBLEM_ID,
    entryMode: "ANSWER_ONLY",
    selfReport: "SOLVED_CONFIDENT"
  });
  const state = await tQuery(jar, "unifiedAttempt.getState", { problemId: INTEGER_PROBLEM_ID });
  const attemptId = (extract<{ attempt: { id: string } }>(state).attempt as { id: string }).id;
  const r = await tMutate(jar, "unifiedAttempt.submit", { attemptId, finalAnswer: "18" });
  const data = extract<{ attempt: { isCorrect: boolean; submittedAnswer: string } }>(r);
  console.log(
    "  submitted:",
    data.attempt.submittedAnswer,
    "→",
    data.attempt.isCorrect ? colour("✓") + " correct" : colour("✗") + " wrong"
  );
  if (!data.attempt.isCorrect) throw new Error("ANSWER_ONLY flow should grade 18 as correct");
}

async function runStuckWithWork(jar: CookieJar) {
  console.log("\n=== Flow 2: STUCK_WITH_WORK ===");
  await resetProblemAttempts(jar, INTEGER_PROBLEM_ID);
  await tMutate(jar, "unifiedAttempt.chooseEntry", {
    problemId: INTEGER_PROBLEM_ID,
    entryMode: "STUCK_WITH_WORK",
    selfReport: "ATTEMPTED_STUCK"
  });
  const state = await tQuery(jar, "unifiedAttempt.getState", { problemId: INTEGER_PROBLEM_ID });
  const attemptId = (extract<{ attempt: { id: string } }>(state).attempt as { id: string }).id;
  const steps = [
    "(x + 1/x)^3 = x^3 + 3x + 3/x + 1/x^3",
    "x^3 + 1/x^3 = (x + 1/x)^3 - 3(x + 1/x)"
  ];
  for (const s of steps) {
    await tMutate(jar, "unifiedAttempt.addStep", { attemptId, latexInput: s });
  }
  await tMutate(jar, "unifiedAttempt.submit", { attemptId, finalAnswer: "18" });
  const after = await tQuery(jar, "unifiedAttempt.getState", { problemId: INTEGER_PROBLEM_ID });
  const a = extract<{ attempt: { isCorrect: boolean; submittedAnswer: string; overallFeedback: string | null; steps: Array<{ stepIndex: number; verdict: string; verificationBackend: string }> } }>(after).attempt;
  for (const s of a.steps) {
    console.log(`  step ${s.stepIndex}: ${colour(s.verdict)} (${s.verificationBackend})`);
  }
  console.log("  submitted:", a.submittedAnswer, a.isCorrect ? "correct" : "wrong");
  console.log("  review:", a.overallFeedback?.slice(0, 160));
  if (!a.isCorrect) throw new Error("STUCK flow should still grade 18 as correct");
}

async function runHintGuided(jar: CookieJar) {
  console.log("\n=== Flow 3: HINT_GUIDED ===");
  await resetProblemAttempts(jar, INTEGER_PROBLEM_ID);
  await tMutate(jar, "unifiedAttempt.chooseEntry", {
    problemId: INTEGER_PROBLEM_ID,
    entryMode: "HINT_GUIDED",
    selfReport: "NO_IDEA"
  });
  const state = await tQuery(jar, "unifiedAttempt.getState", { problemId: INTEGER_PROBLEM_ID });
  const attemptId = (extract<{ attempt: { id: string } }>(state).attempt as { id: string }).id;

  for (let i = 0; i < 2; i += 1) {
    const h = await tMutate(jar, "unifiedAttempt.requestHint", { attemptId });
    const hint = extract<{ hint: { hintLevel: number; hintText: string }; exhausted: boolean }>(h);
    console.log(`  hint ${hint.hint.hintLevel}: ${hint.hint.hintText.slice(0, 100)}…`);
  }

  await tMutate(jar, "unifiedAttempt.upgradeMode", { attemptId, entryMode: "ANSWER_ONLY" });
  const r = await tMutate(jar, "unifiedAttempt.submit", { attemptId, finalAnswer: "18" });
  const data = extract<{ attempt: { isCorrect: boolean; hintsUsedCount: number } }>(r);
  console.log(
    `  submitted after ${data.attempt.hintsUsedCount} hints:`,
    data.attempt.isCorrect ? colour("✓") + " correct" : colour("✗") + " wrong"
  );
  if (data.attempt.hintsUsedCount !== 2) throw new Error("hintsUsedCount should be 2");
}

async function runProofFlow(jar: CookieJar) {
  console.log("\n=== Flow 4: PROOF_STEPS ===");
  await resetProblemAttempts(jar, PROOF_PROBLEM_ID);
  await tMutate(jar, "unifiedAttempt.chooseEntry", {
    problemId: PROOF_PROBLEM_ID,
    entryMode: "PROOF_STEPS"
  });
  const state = await tQuery(jar, "unifiedAttempt.getState", { problemId: PROOF_PROBLEM_ID });
  const attemptId = (extract<{ attempt: { id: string } }>(state).attempt as { id: string }).id;

  const steps = [
    "(x + 1/x)^3 = x^3 + 3x + 3/x + 1/x^3",
    "x^3 + 1/x^3 = (x + 1/x)^3 - 3(x + 1/x)",
    "27 - 9 = 17" // intentional error
  ];
  for (const s of steps) {
    await tMutate(jar, "unifiedAttempt.addStep", { attemptId, latexInput: s });
  }
  await tMutate(jar, "unifiedAttempt.submit", { attemptId });
  const after = await tQuery(jar, "unifiedAttempt.getState", { problemId: PROOF_PROBLEM_ID });
  const a = extract<{ attempt: { overallFeedback: string | null; steps: Array<{ stepIndex: number; verdict: string; verificationBackend: string }> } }>(after).attempt;
  for (const s of a.steps) {
    console.log(`  step ${s.stepIndex}: ${colour(s.verdict)} (${s.verificationBackend})`);
  }
  console.log("  review:", a.overallFeedback?.slice(0, 160));
  const invalidFound = a.steps.some((s) => s.verdict === "INVALID");
  if (!invalidFound) throw new Error("proof flow should catch the '27-9=17' error");
}

async function main() {
  const jar = new CookieJar();
  await login(jar);

  await runAnswerOnly(jar);
  await runStuckWithWork(jar);
  await runHintGuided(jar);
  await runProofFlow(jar);

  console.log("\n✓ all four flows passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
