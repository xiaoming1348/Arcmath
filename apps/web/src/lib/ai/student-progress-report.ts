/**
 * Lifetime student-progress report — aggregates every ProblemAttempt a
 * user has ever made into a single multi-dimensional snapshot, then
 * calls an LLM to write a short personalized study plan.
 *
 * Distinct from `learning-report.ts`:
 *   - learning-report.ts is per-PracticeRun (one problem set).
 *   - this module is lifetime (every attempt the user has ever submitted),
 *     aggregated across all sets, contests, dates.
 *
 * Phase A (MVP) — synchronous compute on every page view, no DB caching.
 * Phase B will add weekly snapshots + delta tracking; Phase C will add
 * concrete next-problem recommendations.
 *
 * Surfaced on /me/progress.
 */

import { z } from "zod";
import { callOpenAIJson } from "@/lib/ai/openai-json";

// v2 = scope tightening (2026-05-23). Plan output is now hard-restricted
// to: (A) which topics to focus on, (B) how to practice them, (C) how
// much time to spend on which contests. Everything else (sleep, mindset,
// admissions, tutors, other apps) is explicitly forbidden in the prompt.
// If you bump again, document the delta here.
export const STUDENT_PROGRESS_PROMPT_VERSION = "student-progress-plan-v2";

// =============================================================================
// AGGREGATION TYPES
// =============================================================================

export type TopicSlice = {
  /** dot.separated key, e.g. "algebra.linear_systems" */
  topicKey: string;
  /** Human-readable label derived from the key. */
  label: string;
  attemptCount: number;
  correctCount: number;
  accuracy: number; // 0..1
  /** Avg hints used per attempt in this topic — higher = more friction. */
  hintsPerAttempt: number;
};

export type DifficultySlice = {
  difficultyBand: "EASY" | "MEDIUM" | "HARD" | "UNSPECIFIED";
  attemptCount: number;
  correctCount: number;
  accuracy: number;
};

export type ContestSlice = {
  contest: string;
  attemptCount: number;
  correctCount: number;
  accuracy: number;
};

/** One weekly snapshot — used by the trend chart. */
export type WeeklySnapshotPoint = {
  /** ISO date — the END of the 7-day window. */
  windowEnd: string;
  totalAttempts: number;
  totalCorrect: number;
  accuracy: number; // cumulative-to-windowEnd, 0..1
};

/** "This week vs previous week" deltas. Null when not enough history. */
export type WeekOverWeekDelta = {
  /** Attempts in the most recent 7-day window. */
  attemptsThisWeek: number;
  /** Same metric for the prior 7-day window (8-14 days ago). */
  attemptsLastWeek: number;
  /** Cumulative accuracy at end of this week minus end of last week,
   *  in percentage points. Can be negative. */
  accuracyDeltaPP: number;
};

export type StudentProgressReport = {
  userId: string;
  generatedAt: string;
  // ---- totals ----
  firstAttemptAt: string | null;
  lastAttemptAt: string | null;
  daysSinceFirstAttempt: number; // for "you've been on Arcmath N days"
  totalAttempts: number;
  totalCorrect: number;
  lifetimeAccuracy: number; // 0..1
  // ---- time ----
  totalTimeSpentMinutes: number;
  avgTimePerAttemptSeconds: number;
  // ---- hint reliance ----
  totalHintsUsed: number;
  avgHintsPerAttempt: number;
  /** What share of attempts used at least one hint. 0..1. */
  hintReliance: number;
  // ---- dimensions ----
  byTopic: TopicSlice[];
  byDifficulty: DifficultySlice[];
  byContest: ContestSlice[];
  /** Top 3 topics by mastery (accuracy, with attempt count tiebreaker). */
  topStrengths: TopicSlice[];
  /** Top 3 topics by friction (low accuracy or high hint reliance). */
  topWeaknesses: TopicSlice[];
  // ---- streak & cadence ----
  /** How many days in the last 14 the student touched the platform. */
  activeDaysLast14: number;
  // ---- Phase B: time-series ----
  /** Up to 12 most-recent weekly snapshot points, oldest → newest. */
  weeklyTrend: WeeklySnapshotPoint[];
  /** Delta between the most recent two weeks. Null if < 2 snapshots. */
  weekOverWeek: WeekOverWeekDelta | null;
  // ---- LLM-generated plan ----
  llmPlan: StudentProgressPlan | null;
};

// =============================================================================
// LLM SCHEMA
// =============================================================================

export type StudentProgressPlan = {
  /** 1-2 sentence overview of where the student stands today. */
  summary: string;
  /** Honest assessment of the strongest pattern. */
  strengthNote: string;
  /** Honest assessment of the weakest pattern. */
  weaknessNote: string;
  /** 3-5 concrete next moves, each 1 sentence, actionable. */
  nextMoves: string[];
  /** A 2-week or 4-week goal — measurable. */
  milestoneGoal: string;
};

const planSchema = z.object({
  summary: z.string().min(1),
  strengthNote: z.string().min(1),
  weaknessNote: z.string().min(1),
  nextMoves: z.array(z.string().min(1)).min(3).max(5),
  milestoneGoal: z.string().min(1)
});

const planJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    strengthNote: { type: "string" },
    weaknessNote: { type: "string" },
    nextMoves: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 5
    },
    milestoneGoal: { type: "string" }
  },
  required: [
    "summary",
    "strengthNote",
    "weaknessNote",
    "nextMoves",
    "milestoneGoal"
  ]
} as const;

// =============================================================================
// INPUT SHAPE
// =============================================================================

export type ProgressAttemptInput = {
  id: string;
  isCorrect: boolean;
  hintsUsedCount: number;
  createdAt: Date;
  submittedAt: Date | null;
  problem: {
    topicKey: string | null;
    difficultyBand: string | null;
    problemSet: { contest: string | null };
  };
};

// =============================================================================
// AGGREGATION (pure function — easy to unit test)
// =============================================================================

function topicLabel(topicKey: string): string {
  return topicKey
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function normalizeBand(value: string | null | undefined): DifficultySlice["difficultyBand"] {
  if (value === "EASY" || value === "MEDIUM" || value === "HARD") return value;
  return "UNSPECIFIED";
}

function attemptDurationSec(a: ProgressAttemptInput): number {
  if (!a.submittedAt) return 0;
  const ms = a.submittedAt.getTime() - a.createdAt.getTime();
  // Clamp at 0 (clock skew) and at 30min (idle / left tab open).
  // Otherwise a single forgotten tab dominates the average.
  const seconds = Math.floor(ms / 1000);
  if (seconds < 0) return 0;
  if (seconds > 30 * 60) return 30 * 60;
  return seconds;
}

// Aggregation is the static (no-LLM, no-history) slice of the report.
// Phase B additions (weeklyTrend, weekOverWeek) live on the full report,
// not here, because they require external snapshot history.
export type ProgressAggregation = Omit<
  StudentProgressReport,
  "llmPlan" | "weeklyTrend" | "weekOverWeek"
>;

export function aggregateProgress(
  userId: string,
  attempts: ProgressAttemptInput[]
): ProgressAggregation {
  const now = new Date();
  // Filter to attempts that have been submitted (drafts excluded).
  const finished = attempts.filter((a) => a.submittedAt !== null);

  // ---- totals ----
  const totalAttempts = finished.length;
  const totalCorrect = finished.filter((a) => a.isCorrect).length;
  const lifetimeAccuracy = totalAttempts === 0 ? 0 : totalCorrect / totalAttempts;

  // ---- time ----
  const totalTimeSpentSec = finished.reduce((acc, a) => acc + attemptDurationSec(a), 0);
  const avgTimePerAttemptSec =
    totalAttempts === 0 ? 0 : Math.round(totalTimeSpentSec / totalAttempts);
  const totalTimeSpentMinutes = Math.round(totalTimeSpentSec / 60);

  // ---- hints ----
  const totalHintsUsed = finished.reduce((acc, a) => acc + (a.hintsUsedCount ?? 0), 0);
  const avgHintsPerAttempt = totalAttempts === 0 ? 0 : totalHintsUsed / totalAttempts;
  const attemptsUsingHints = finished.filter((a) => (a.hintsUsedCount ?? 0) > 0).length;
  const hintReliance = totalAttempts === 0 ? 0 : attemptsUsingHints / totalAttempts;

  // ---- by topic ----
  const topicMap = new Map<
    string,
    { topicKey: string; attemptCount: number; correctCount: number; hintsSum: number }
  >();
  for (const a of finished) {
    const key = a.problem.topicKey;
    if (!key) continue;
    const cur = topicMap.get(key) ?? {
      topicKey: key,
      attemptCount: 0,
      correctCount: 0,
      hintsSum: 0
    };
    cur.attemptCount += 1;
    if (a.isCorrect) cur.correctCount += 1;
    cur.hintsSum += a.hintsUsedCount ?? 0;
    topicMap.set(key, cur);
  }
  const byTopic: TopicSlice[] = Array.from(topicMap.values())
    .map((row) => ({
      topicKey: row.topicKey,
      label: topicLabel(row.topicKey),
      attemptCount: row.attemptCount,
      correctCount: row.correctCount,
      accuracy: row.attemptCount === 0 ? 0 : row.correctCount / row.attemptCount,
      hintsPerAttempt:
        row.attemptCount === 0 ? 0 : row.hintsSum / row.attemptCount
    }))
    .sort((a, b) => b.attemptCount - a.attemptCount);

  // Strengths: topics with ≥3 attempts and accuracy ≥ 0.7 — sorted by
  // accuracy * sqrt(count) so a very-confident-but-tiny sample doesn't
  // drown out a substantial moderately-strong topic.
  const STRENGTH_MIN_ATTEMPTS = 3;
  const topStrengths = byTopic
    .filter((t) => t.attemptCount >= STRENGTH_MIN_ATTEMPTS && t.accuracy >= 0.7)
    .sort((a, b) => b.accuracy * Math.sqrt(b.attemptCount) - a.accuracy * Math.sqrt(a.attemptCount))
    .slice(0, 3);

  // Weaknesses: ≥3 attempts AND (accuracy < 0.5 OR hintsPerAttempt > 1.5).
  // Friction score = (1 - accuracy) + 0.3 * hintsPerAttempt, weighted by sqrt(count).
  const topWeaknesses = byTopic
    .filter(
      (t) =>
        t.attemptCount >= STRENGTH_MIN_ATTEMPTS &&
        (t.accuracy < 0.5 || t.hintsPerAttempt > 1.5)
    )
    .map((t) => ({
      ...t,
      _friction:
        ((1 - t.accuracy) + 0.3 * t.hintsPerAttempt) * Math.sqrt(t.attemptCount)
    }))
    .sort((a, b) => b._friction - a._friction)
    .slice(0, 3)
    .map(({ _friction, ...rest }) => {
      void _friction;
      return rest;
    });

  // Make strengths and weaknesses disjoint: if a topic has high accuracy
  // BUT also high hint-reliance, it landed in weaknesses (friction-based).
  // Don't also show it as a strength — UI looks incoherent ("Algebra is
  // both your strongest and your weakest topic?"). Weakness wins.
  const weaknessKeys = new Set(topWeaknesses.map((t) => t.topicKey));
  const topStrengthsDedup = topStrengths.filter((t) => !weaknessKeys.has(t.topicKey));

  // ---- by difficulty ----
  const diffMap = new Map<
    DifficultySlice["difficultyBand"],
    { difficultyBand: DifficultySlice["difficultyBand"]; attemptCount: number; correctCount: number }
  >();
  for (const a of finished) {
    const band = normalizeBand(a.problem.difficultyBand);
    const cur = diffMap.get(band) ?? {
      difficultyBand: band,
      attemptCount: 0,
      correctCount: 0
    };
    cur.attemptCount += 1;
    if (a.isCorrect) cur.correctCount += 1;
    diffMap.set(band, cur);
  }
  const ORDER: DifficultySlice["difficultyBand"][] = ["EASY", "MEDIUM", "HARD", "UNSPECIFIED"];
  const byDifficulty: DifficultySlice[] = ORDER.map((band) => {
    const row = diffMap.get(band);
    if (!row) {
      return { difficultyBand: band, attemptCount: 0, correctCount: 0, accuracy: 0 };
    }
    return {
      difficultyBand: row.difficultyBand,
      attemptCount: row.attemptCount,
      correctCount: row.correctCount,
      accuracy: row.attemptCount === 0 ? 0 : row.correctCount / row.attemptCount
    };
  }).filter((row) => row.attemptCount > 0);

  // ---- by contest ----
  const contestMap = new Map<
    string,
    { contest: string; attemptCount: number; correctCount: number }
  >();
  for (const a of finished) {
    const contest = a.problem.problemSet.contest;
    if (!contest) continue;
    const cur = contestMap.get(contest) ?? {
      contest,
      attemptCount: 0,
      correctCount: 0
    };
    cur.attemptCount += 1;
    if (a.isCorrect) cur.correctCount += 1;
    contestMap.set(contest, cur);
  }
  const byContest: ContestSlice[] = Array.from(contestMap.values())
    .map((row) => ({
      contest: row.contest,
      attemptCount: row.attemptCount,
      correctCount: row.correctCount,
      accuracy: row.attemptCount === 0 ? 0 : row.correctCount / row.attemptCount
    }))
    .sort((a, b) => b.attemptCount - a.attemptCount);

  // ---- cadence ----
  const first = finished.length === 0 ? null : finished.reduce((m, a) => (a.createdAt < m ? a.createdAt : m), finished[0].createdAt);
  const last = finished.length === 0 ? null : finished.reduce((m, a) => (a.createdAt > m ? a.createdAt : m), finished[0].createdAt);
  const daysSinceFirst = first
    ? Math.max(1, Math.floor((now.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const activeDaysSet = new Set<string>();
  for (const a of finished) {
    if (a.createdAt < cutoff) continue;
    activeDaysSet.add(a.createdAt.toISOString().slice(0, 10));
  }

  return {
    userId,
    generatedAt: now.toISOString(),
    firstAttemptAt: first ? first.toISOString() : null,
    lastAttemptAt: last ? last.toISOString() : null,
    daysSinceFirstAttempt: daysSinceFirst,
    totalAttempts,
    totalCorrect,
    lifetimeAccuracy,
    totalTimeSpentMinutes,
    avgTimePerAttemptSeconds: avgTimePerAttemptSec,
    totalHintsUsed,
    avgHintsPerAttempt,
    hintReliance,
    byTopic,
    byDifficulty,
    byContest,
    topStrengths: topStrengthsDedup,
    topWeaknesses,
    activeDaysLast14: activeDaysSet.size
  };
}

// =============================================================================
// LLM PLAN GENERATION
// =============================================================================

// Exported so unit tests can assert the strict-scope rules are present
// and the snapshot numbers are not lost in serialization. Caller code
// should NOT call this directly — use `generateStudentProgressPlan`.
export function buildPlanPrompt(agg: ProgressAggregation, locale: "en" | "zh"): string {
  const localeRule =
    locale === "zh"
      ? "Reply in Mandarin Chinese (Simplified). Natural tutorial phrasing — not stiff translations."
      : "Reply in English.";

  // Pick the most informative dimensions to feed the model. Keep the
  // prompt under ~1 KB so latency stays low.
  const topicSummary = {
    strengths: agg.topStrengths.map((t) => ({
      topic: t.label,
      attempts: t.attemptCount,
      accuracy: Number(t.accuracy.toFixed(2))
    })),
    weaknesses: agg.topWeaknesses.map((t) => ({
      topic: t.label,
      attempts: t.attemptCount,
      accuracy: Number(t.accuracy.toFixed(2)),
      hintsPerAttempt: Number(t.hintsPerAttempt.toFixed(2))
    }))
  };

  const profile = {
    daysOnArcmath: agg.daysSinceFirstAttempt,
    totalAttempts: agg.totalAttempts,
    accuracy: Number(agg.lifetimeAccuracy.toFixed(2)),
    avgMinutesPerProblem: Math.round(agg.avgTimePerAttemptSeconds / 60),
    hintReliance: Number(agg.hintReliance.toFixed(2)),
    activeDaysLast14: agg.activeDaysLast14,
    byDifficulty: agg.byDifficulty.map((d) => ({
      band: d.difficultyBand,
      attempts: d.attemptCount,
      accuracy: Number(d.accuracy.toFixed(2))
    })),
    byContest: agg.byContest.slice(0, 5).map((c) => ({
      contest: c.contest,
      attempts: c.attemptCount,
      accuracy: Number(c.accuracy.toFixed(2))
    })),
    topics: topicSummary
  };

  return [
    "You are a one-on-one competition-math coach writing a SHORT, NARROW-SCOPE personalized study plan.",
    "You are given a structured snapshot of the student's LIFETIME activity on the platform.",
    "",
    "STRICT SCOPE — every line you write must fit ONE of these three categories:",
    "  (A) WHICH math knowledge points / topics to focus on next.",
    "  (B) HOW to practice them — drill style, problem source, frequency, what to redo.",
    "  (C) HOW MUCH time to spend on which competition (AMC8/10/12, AIME, USAMO, Putnam, Euclid, MAT, STEP, Olympiad).",
    "",
    "FORBIDDEN — never mention any of these, even briefly:",
    "  - Sleep, diet, stress, mental health, motivation, mindset, confidence.",
    "  - Study music, lighting, environment, ergonomics, Pomodoro / Forest / app recommendations.",
    "  - College admissions, applications, essays, transcripts, GPA, recommendations.",
    "  - Test-day strategy (calculator, timing within an exam, snacks, what to bring).",
    "  - Group study, study buddies, classmates, friends, parents, tutors, coaches, teachers.",
    "  - Other platforms or apps; never suggest switching off Arcmath.",
    "  - Career advice, future plans, life goals.",
    "  - Generic encouragement (\"keep going!\", \"you've got this!\", \"believe in yourself\"). Replace with a concrete action.",
    "",
    "Output rules:",
    "- Return valid JSON ONLY.",
    "- summary: 1-2 sentences. State how long they've been on the platform and the headline accuracy. Nothing else.",
    "- strengthNote: ONE sentence naming ONE topic from the snapshot where they're strong, with the actual accuracy number from the snapshot.",
    "- weaknessNote: ONE sentence naming ONE topic from the snapshot that needs work, with the actual accuracy number.",
    "- nextMoves: 3-5 short sentences. Each must be a concrete action that falls under category (A), (B), or (C) above. Examples that PASS: \"Spend the next two weeks on AMC10 medium geometry — aim for 8 problems per week.\" Examples that FAIL (do not emit): \"Stay confident.\" / \"Ask your teacher for help.\" / \"Take breaks.\"",
    "- milestoneGoal: ONE measurable 4-week goal expressed as a number — accuracy %, problem count, or contest band. Examples that PASS: \"Raise AMC10 accuracy from 62% to 72%.\" / \"Finish 30 more AIME problems with ≥50% accuracy.\"",
    "- Never invent numbers. Use only numbers in the snapshot.",
    "- Tone: direct, specific, second-person (\"you\"). No filler, no hedging, no exclamation marks.",
    `- ${localeRule}`,
    `Prompt version: ${STUDENT_PROGRESS_PROMPT_VERSION}`,
    `Student snapshot:\n${JSON.stringify(profile, null, 2)}`
  ].join("\n");
}

export async function generateStudentProgressPlan(
  agg: ProgressAggregation,
  locale: "en" | "zh"
): Promise<StudentProgressPlan | null> {
  // No data → no point asking the LLM. The page will show an empty state.
  if (agg.totalAttempts === 0) return null;
  const prompt = buildPlanPrompt(agg, locale);
  return callOpenAIJson({
    scope: "student-progress-plan",
    schemaName: "student_progress_plan",
    prompt,
    schema: planSchema,
    jsonSchema: planJsonSchema,
    maxOutputTokens: 600
  });
}

export function getFallbackPlan(
  agg: ProgressAggregation,
  locale: "en" | "zh"
): StudentProgressPlan {
  const accuracyPct = Math.round(agg.lifetimeAccuracy * 100);
  if (locale === "zh") {
    return {
      summary: `你已经在 Arcmath 做了 ${agg.totalAttempts} 道题，整体正确率 ${accuracyPct}%。继续保持这个节奏。`,
      strengthNote:
        agg.topStrengths.length > 0
          ? `你在 ${agg.topStrengths[0].label} 上表现最稳。`
          : "练习量还不够多，暂时看不出明显的强项——再多刷几道我们就能告诉你。",
      weaknessNote:
        agg.topWeaknesses.length > 0
          ? `${agg.topWeaknesses[0].label} 是当前最需要补的方向。`
          : "暂时没有特别突出的薄弱点——保持广度。",
      nextMoves: [
        "继续保持每周 3-5 道题的稳定节奏。",
        "刷题前先估时间，刷完对一对实际用时，培养考试节奏感。",
        "遇到错题后立刻回头自己重做一遍，不要立刻看答案。"
      ],
      milestoneGoal: `4 周后把正确率从 ${accuracyPct}% 提升 5 个百分点。`
    };
  }
  return {
    summary: `You've worked through ${agg.totalAttempts} problems on Arcmath at ${accuracyPct}% accuracy. Keep the cadence.`,
    strengthNote:
      agg.topStrengths.length > 0
        ? `${agg.topStrengths[0].label} is your steadiest topic.`
        : "Not enough volume yet to call out a clear strength — keep going and we'll surface one.",
    weaknessNote:
      agg.topWeaknesses.length > 0
        ? `${agg.topWeaknesses[0].label} is the clearest area to reinforce next.`
        : "No standout weakness — keep broad coverage.",
    nextMoves: [
      "Keep a steady cadence of 3-5 problems per week.",
      "Estimate how long a problem should take before starting, then compare to your actual time.",
      "When you miss a problem, redo it from scratch BEFORE reading the solution."
    ],
    milestoneGoal: `In 4 weeks, push lifetime accuracy from ${accuracyPct}% by 5 percentage points.`
  };
}

// =============================================================================
// CONVENIENCE: full report assembly (DB-free; caller passes the attempts)
// =============================================================================

export async function buildStudentProgressReport(params: {
  userId: string;
  attempts: ProgressAttemptInput[];
  locale: "en" | "zh";
  /** Optional historical snapshots (oldest → newest) for trend rendering. */
  snapshots?: Array<{
    windowEnd: Date;
    totalAttempts: number;
    totalCorrect: number;
    accuracy: number;
  }>;
}): Promise<StudentProgressReport> {
  const agg = aggregateProgress(params.userId, params.attempts);
  let llmPlan: StudentProgressPlan | null = null;
  try {
    llmPlan = await generateStudentProgressPlan(agg, params.locale);
  } catch (err) {
    console.warn("[student-progress] LLM plan generation failed", err);
  }
  if (!llmPlan && agg.totalAttempts > 0) {
    llmPlan = getFallbackPlan(agg, params.locale);
  }

  // ---- Phase B: weave snapshot history into the report ----
  // Snapshot rows are cumulative-to-windowEnd, so accuracy progression
  // and attempt count are read directly. We also append the current
  // live aggregate as a "now" point so the chart's rightmost edge is
  // always today, not last week.
  const trend: WeeklySnapshotPoint[] = (params.snapshots ?? [])
    .slice() // copy so we don't mutate caller's array
    .sort((a, b) => a.windowEnd.getTime() - b.windowEnd.getTime())
    .slice(-12) // last 12 weekly points max
    .map((s) => ({
      windowEnd: s.windowEnd.toISOString(),
      totalAttempts: s.totalAttempts,
      totalCorrect: s.totalCorrect,
      accuracy: s.accuracy
    }));

  // Append a "now" point if there's been activity since the latest snapshot.
  const latestSnapshotEnd = trend.length > 0 ? new Date(trend[trend.length - 1].windowEnd) : null;
  const hasNewActivity =
    latestSnapshotEnd === null ||
    (agg.lastAttemptAt !== null && new Date(agg.lastAttemptAt) > latestSnapshotEnd);
  if (hasNewActivity) {
    trend.push({
      windowEnd: agg.generatedAt,
      totalAttempts: agg.totalAttempts,
      totalCorrect: agg.totalCorrect,
      accuracy: agg.lifetimeAccuracy
    });
  }

  // Week-over-week delta requires ≥ 2 trend points.
  let weekOverWeek: WeekOverWeekDelta | null = null;
  if (trend.length >= 2) {
    const prev = trend[trend.length - 2];
    const curr = trend[trend.length - 1];
    weekOverWeek = {
      attemptsThisWeek: curr.totalAttempts - prev.totalAttempts,
      attemptsLastWeek:
        trend.length >= 3
          ? prev.totalAttempts - trend[trend.length - 3].totalAttempts
          : prev.totalAttempts,
      accuracyDeltaPP: (curr.accuracy - prev.accuracy) * 100
    };
  }

  return { ...agg, weeklyTrend: trend, weekOverWeek, llmPlan };
}

// =============================================================================
// Snapshot helpers (Phase B)
// =============================================================================

/**
 * Returns the start-of-week (Monday 00:00 UTC) for a given date. Used
 * as the snapshot dedup key — one snapshot per user per ISO week.
 */
export function startOfIsoWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0 (Sun) .. 6 (Sat)
  const diffFromMonday = (day + 6) % 7; // Mon = 0, Sun = 6
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - diffFromMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/** True if the previous snapshot is missing OR older than 6 days. */
export function isSnapshotDue(latestSnapshotAt: Date | null, now: Date): boolean {
  if (!latestSnapshotAt) return true;
  const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
  return now.getTime() - latestSnapshotAt.getTime() >= sixDaysMs;
}
