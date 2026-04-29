/**
 * Proof-eval harness.
 *
 * Replays every scenario in the catalog against the live unified-attempt API
 * as a real student user, then reports per-step actual-vs-expected verdicts,
 * per-scenario pass/fail, latency, and a rollup table.
 *
 * Usage:
 *   pnpm proof:eval                 — run all fixtures
 *   pnpm proof:eval --key usamo-2020-p1-demo   — run one problem
 *
 * Requires dev server + proof-verifier running, and DISABLE_ACCESS_GATING=1
 * (or the student having explicit access to the seed sets).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CookieJar } from "tough-cookie";
import { prisma } from "@arcmath/db";
import {
  FIXTURES,
  type ExpectedVerdict,
  type ProblemFixture,
  type ProofScenario
} from "./fixtures/proof-eval/catalog";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL ?? "northstar.student1@arcmath.local";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "Trial2026Pass";

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
  const csrfRes = await jarFetch(jar, `${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
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
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text}`);
  return JSON.parse(text) as Json;
}

function extract<T>(r: Json): T {
  return ((r.result as Json)?.data as T);
}

// ANSI colours
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
};

function verdictMatches(actual: string, expected: ExpectedVerdict): boolean {
  if (expected === "ANY") return true;
  return actual === expected;
}

function verdictColour(v: string): string {
  switch (v) {
    case "VERIFIED":
      return C.green;
    case "PLAUSIBLE":
      return C.yellow;
    case "INVALID":
    case "ERROR":
      return C.red;
    default:
      return C.dim;
  }
}

type ScenarioResult = {
  problemKey: string;
  scenarioLabel: string;
  description: string;
  passed: boolean;
  perStep: Array<{ index: number; latex: string; actual: string; expected: ExpectedVerdict; match: boolean; backend: string }>;
  answerCheck: { expected: boolean | null; actual: boolean | null; match: boolean | null };
  latencyMs: number;
  overallFeedback: string | null;
  error?: string;
};

async function resolveProblemIds(): Promise<Map<string, string>> {
  // Map fixture key → Problem.id by looking up (contest, year, exam, number)
  const map = new Map<string, string>();
  for (const f of FIXTURES) {
    const set = await prisma.problemSet.findFirst({
      where: { contest: f.contest, year: f.year, exam: f.exam },
      select: { id: true }
    });
    if (!set) {
      console.warn(`  WARN: problem set not found for ${f.contest} ${f.year} ${f.exam ?? ""} — skipping`);
      continue;
    }
    const problem = await prisma.problem.findFirst({
      where: { problemSetId: set.id, number: f.problemNumber },
      select: { id: true }
    });
    if (!problem) {
      console.warn(`  WARN: problem #${f.problemNumber} not found in set ${set.id} — skipping`);
      continue;
    }
    map.set(f.key, problem.id);
  }
  return map;
}

async function resetAttempt(jar: CookieJar, problemId: string): Promise<void> {
  await tMutate(jar, "unifiedAttempt.startNewAttempt", { problemId });
}

async function runScenario(
  jar: CookieJar,
  fixture: ProblemFixture,
  problemId: string,
  scenario: ProofScenario
): Promise<ScenarioResult> {
  const startedAt = Date.now();
  try {
    await resetAttempt(jar, problemId);
    await tMutate(jar, "unifiedAttempt.chooseEntry", {
      problemId,
      entryMode: scenario.entryMode,
      selfReport:
        scenario.entryMode === "PROOF_STEPS"
          ? "ATTEMPTED_STUCK"
          : scenario.entryMode === "STUCK_WITH_WORK"
            ? "ATTEMPTED_STUCK"
            : "SOLVED_CONFIDENT"
    });
    const state = await tQuery(jar, "unifiedAttempt.getState", { problemId });
    const attemptId = (extract<{ attempt: { id: string } }>(state).attempt as { id: string }).id;

    for (const s of scenario.steps) {
      await tMutate(jar, "unifiedAttempt.addStep", { attemptId, latexInput: s });
    }

    await tMutate(jar, "unifiedAttempt.submit", {
      attemptId,
      ...(scenario.finalAnswer !== undefined ? { finalAnswer: scenario.finalAnswer } : {})
    });

    const after = await tQuery(jar, "unifiedAttempt.getState", { problemId });
    const attempt = extract<{
      attempt: {
        steps: Array<{ stepIndex: number; latexInput: string; verdict: string; verificationBackend: string }>;
        overallFeedback: string | null;
        isCorrect: boolean;
        submittedAnswer: string | null;
      };
    }>(after).attempt;

    const perStep = scenario.steps.map((latex, i) => {
      const actualStep = attempt.steps.find((s) => s.stepIndex === i);
      const actual = actualStep?.verdict ?? "MISSING";
      const expected = scenario.expect[i] ?? "ANY";
      return {
        index: i,
        latex,
        actual,
        expected,
        match: verdictMatches(actual, expected),
        backend: actualStep?.verificationBackend ?? "NONE"
      };
    });

    const expectedAnswer = scenario.expectAnswerCorrect ?? null;
    const actualAnswer =
      scenario.finalAnswer !== undefined ? attempt.isCorrect : null;
    const answerMatch =
      expectedAnswer === null && actualAnswer === null
        ? null
        : expectedAnswer === actualAnswer;

    const passed = perStep.every((s) => s.match) && (answerMatch === null || answerMatch);

    return {
      problemKey: fixture.key,
      scenarioLabel: scenario.label,
      description: scenario.description,
      passed,
      perStep,
      answerCheck: { expected: expectedAnswer, actual: actualAnswer, match: answerMatch },
      latencyMs: Date.now() - startedAt,
      overallFeedback: attempt.overallFeedback
    };
  } catch (err) {
    return {
      problemKey: fixture.key,
      scenarioLabel: scenario.label,
      description: scenario.description,
      passed: false,
      perStep: [],
      answerCheck: { expected: null, actual: null, match: null },
      latencyMs: Date.now() - startedAt,
      overallFeedback: null,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

function renderReport(results: ScenarioResult[]): string {
  const lines: string[] = [];
  lines.push(`# Proof Eval Report`);
  lines.push(`Run at ${new Date().toISOString()}`);
  lines.push("");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  lines.push(`**Summary:** ${passed} / ${total} scenarios passed`);
  lines.push("");

  const byProblem = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    const arr = byProblem.get(r.problemKey) ?? [];
    arr.push(r);
    byProblem.set(r.problemKey, arr);
  }

  for (const [key, scs] of byProblem.entries()) {
    lines.push(`## ${key}`);
    for (const s of scs) {
      lines.push(`- **${s.scenarioLabel}** — ${s.passed ? "✓ PASS" : "✗ FAIL"} (${s.latencyMs} ms)`);
      lines.push(`  - _${s.description}_`);
      if (s.error) {
        lines.push(`  - ERROR: ${s.error}`);
        continue;
      }
      for (const st of s.perStep) {
        lines.push(
          `  - step ${st.index + 1}: ${st.actual} (${st.backend}) vs expected ${st.expected} → ${st.match ? "✓" : "✗"}`
        );
        lines.push(`    latex: \`${st.latex}\``);
      }
      if (s.answerCheck.expected !== null) {
        lines.push(
          `  - answer grading: actual=${s.answerCheck.actual} expected=${s.answerCheck.expected} → ${s.answerCheck.match ? "✓" : "✗"}`
        );
      }
      if (s.overallFeedback) {
        const snippet = s.overallFeedback.length > 240 ? `${s.overallFeedback.slice(0, 237)}…` : s.overallFeedback;
        lines.push(`  - review: ${snippet}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderConsole(results: ScenarioResult[]): void {
  let passed = 0;
  for (const r of results) {
    if (r.passed) passed += 1;
    const badge = r.passed ? `${C.green}✓ PASS${C.reset}` : `${C.red}✗ FAIL${C.reset}`;
    console.log(`\n${badge} ${C.bold}${r.problemKey}${C.reset} · ${r.scenarioLabel} ${C.dim}(${r.latencyMs} ms)${C.reset}`);
    console.log(`  ${C.dim}${r.description}${C.reset}`);
    if (r.error) {
      console.log(`  ${C.red}ERROR:${C.reset} ${r.error}`);
      continue;
    }
    for (const st of r.perStep) {
      const matchIcon = st.match ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
      console.log(
        `  step ${st.index + 1}: ${verdictColour(st.actual)}${st.actual}${C.reset} ` +
          `(${st.backend}) vs expect ${C.cyan}${st.expected}${C.reset} ${matchIcon}`
      );
    }
    if (r.answerCheck.expected !== null) {
      const icon = r.answerCheck.match ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
      console.log(
        `  answer: actual=${r.answerCheck.actual} expected=${r.answerCheck.expected} ${icon}`
      );
    }
  }
  console.log(`\n${C.bold}Summary:${C.reset} ${passed} / ${results.length} scenarios passed`);
}

async function main() {
  const args = process.argv.slice(2);
  const keyIndex = args.indexOf("--key");
  const filterKey = keyIndex >= 0 ? args[keyIndex + 1] : null;
  const reportPath = resolve(process.cwd(), "tmp", "proof-eval-report.md");

  const fixtures = filterKey ? FIXTURES.filter((f) => f.key === filterKey) : FIXTURES;
  if (fixtures.length === 0) {
    console.error(`No fixtures matched filter ${filterKey ?? "(all)"}`);
    process.exit(1);
  }

  console.log(`${C.bold}proof-eval${C.reset} — ${fixtures.length} fixture(s)`);

  const problemIds = await resolveProblemIds();

  const jar = new CookieJar();
  await login(jar);

  const results: ScenarioResult[] = [];
  for (const f of fixtures) {
    const problemId = problemIds.get(f.key);
    if (!problemId) {
      console.log(`${C.yellow}skipping ${f.key}: problem not seeded${C.reset}`);
      continue;
    }
    for (const sc of f.scenarios) {
      const r = await runScenario(jar, f, problemId, sc);
      results.push(r);
    }
  }

  renderConsole(results);

  await mkdir(resolve(process.cwd(), "tmp"), { recursive: true });
  await writeFile(reportPath, renderReport(results), "utf8");
  console.log(`\n${C.dim}Markdown report: ${reportPath}${C.reset}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
