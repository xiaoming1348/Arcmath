import { describe, expect, it } from "vitest";
import {
  aggregateProgress,
  buildPlanPrompt,
  computeMasteryLevel,
  computeTopicMastery,
  getFallbackPlan,
  isSnapshotDue,
  recommendationFor,
  selectDifficultyTargetForTopic,
  startOfIsoWeek,
  STUDENT_PROGRESS_PROMPT_VERSION,
  type ProgressAttemptInput,
  type TopicSlice
} from "./student-progress-report";

// --- helpers ---------------------------------------------------------------

function attempt(
  i: number,
  opts: {
    topic?: string | null;
    difficulty?: "EASY" | "MEDIUM" | "HARD" | null;
    contest?: string | null;
    isCorrect?: boolean;
    hints?: number;
    /** seconds spent (createdAt → submittedAt) */
    durationSec?: number;
    /** offset days into the past for createdAt */
    daysAgo?: number;
  } = {}
): ProgressAttemptInput {
  const now = Date.now();
  const created = new Date(now - (opts.daysAgo ?? 0) * 24 * 60 * 60 * 1000);
  const submitted = new Date(created.getTime() + (opts.durationSec ?? 120) * 1000);
  // IMPORTANT: distinguish "key not provided" from "key set to null" so
  // tests can assert null-handling without falling through to defaults.
  const topicKey =
    "topic" in opts ? (opts.topic as string | null) : "algebra.linear_systems";
  const difficultyBand =
    "difficulty" in opts
      ? (opts.difficulty as string | null)
      : "EASY";
  const contest =
    "contest" in opts ? (opts.contest as string | null) : "AMC10";
  return {
    id: `a${i}`,
    isCorrect: opts.isCorrect ?? true,
    hintsUsedCount: opts.hints ?? 0,
    createdAt: created,
    submittedAt: submitted,
    problem: {
      topicKey,
      difficultyBand,
      problemSet: { contest }
    }
  };
}

// --- aggregateProgress -----------------------------------------------------

describe("aggregateProgress", () => {
  it("returns zeros and empty arrays for no attempts", () => {
    const r = aggregateProgress("u1", []);
    expect(r.totalAttempts).toBe(0);
    expect(r.totalCorrect).toBe(0);
    expect(r.lifetimeAccuracy).toBe(0);
    expect(r.totalTimeSpentMinutes).toBe(0);
    expect(r.byTopic).toEqual([]);
    expect(r.byDifficulty).toEqual([]);
    expect(r.byContest).toEqual([]);
    expect(r.topStrengths).toEqual([]);
    expect(r.topWeaknesses).toEqual([]);
    expect(r.firstAttemptAt).toBeNull();
    expect(r.lastAttemptAt).toBeNull();
  });

  it("excludes attempts with null submittedAt (drafts)", () => {
    const draft: ProgressAttemptInput = {
      ...attempt(0),
      submittedAt: null
    };
    const submitted = attempt(1, { isCorrect: true });
    const r = aggregateProgress("u1", [draft, submitted]);
    expect(r.totalAttempts).toBe(1);
    expect(r.totalCorrect).toBe(1);
  });

  it("computes lifetime accuracy correctly", () => {
    const xs = [
      attempt(1, { isCorrect: true }),
      attempt(2, { isCorrect: true }),
      attempt(3, { isCorrect: false }),
      attempt(4, { isCorrect: false })
    ];
    const r = aggregateProgress("u1", xs);
    expect(r.totalAttempts).toBe(4);
    expect(r.totalCorrect).toBe(2);
    expect(r.lifetimeAccuracy).toBe(0.5);
  });

  it("clamps single-attempt duration at 30 minutes", () => {
    // Two attempts: one normal (2 min), one absurdly long (3 hours).
    // 3-hour one should clamp to 30 min, so total = 32 min.
    const r = aggregateProgress("u1", [
      attempt(1, { durationSec: 120 }),
      attempt(2, { durationSec: 3 * 60 * 60 })
    ]);
    expect(r.totalTimeSpentMinutes).toBe(32);
    // avg = (120 + 1800) / 2 = 960 sec
    expect(r.avgTimePerAttemptSeconds).toBe(960);
  });

  it("treats negative durations (clock skew) as zero", () => {
    const skewed: ProgressAttemptInput = {
      ...attempt(1, { durationSec: 60 }),
      submittedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now())
    };
    const r = aggregateProgress("u1", [skewed]);
    expect(r.totalTimeSpentMinutes).toBe(0);
    expect(r.avgTimePerAttemptSeconds).toBe(0);
  });

  it("hint reliance and avg are right", () => {
    const xs = [
      attempt(1, { hints: 0 }),
      attempt(2, { hints: 2 }),
      attempt(3, { hints: 3 }),
      attempt(4, { hints: 0 })
    ];
    const r = aggregateProgress("u1", xs);
    // 2 of 4 used hints → 50%
    expect(r.hintReliance).toBe(0.5);
    // 5 hints / 4 attempts = 1.25
    expect(r.avgHintsPerAttempt).toBe(1.25);
    expect(r.totalHintsUsed).toBe(5);
  });

  it("groups by topic and computes per-topic accuracy + hint avg", () => {
    const xs = [
      attempt(1, { topic: "algebra.x", isCorrect: true, hints: 0 }),
      attempt(2, { topic: "algebra.x", isCorrect: true, hints: 1 }),
      attempt(3, { topic: "algebra.x", isCorrect: false, hints: 2 }),
      attempt(4, { topic: "geometry.y", isCorrect: true, hints: 0 })
    ];
    const r = aggregateProgress("u1", xs);
    const algebra = r.byTopic.find((t) => t.topicKey === "algebra.x");
    expect(algebra).toBeDefined();
    expect(algebra!.attemptCount).toBe(3);
    expect(algebra!.correctCount).toBe(2);
    expect(algebra!.accuracy).toBeCloseTo(2 / 3);
    expect(algebra!.hintsPerAttempt).toBeCloseTo(1);
    expect(algebra!.label).toBe("Algebra / X");
  });

  it("requires ≥3 attempts to surface a topic as a strength", () => {
    const xs = [
      // Only 1 attempt in geometry, even though 100% — shouldn't be strength.
      attempt(1, { topic: "geometry.tiny", isCorrect: true }),
      // 3 attempts in algebra at 100% — should be a strength.
      attempt(2, { topic: "algebra.solid", isCorrect: true }),
      attempt(3, { topic: "algebra.solid", isCorrect: true }),
      attempt(4, { topic: "algebra.solid", isCorrect: true })
    ];
    const r = aggregateProgress("u1", xs);
    expect(r.topStrengths.map((t) => t.topicKey)).toEqual(["algebra.solid"]);
    expect(r.topStrengths[0].accuracy).toBe(1);
  });

  it("requires ≥3 attempts to surface a topic as a weakness", () => {
    const xs = [
      // 1 attempt failed — not enough sample for weakness call.
      attempt(1, { topic: "weak.tiny", isCorrect: false }),
      // 3 attempts, accuracy 0% — clear weakness.
      attempt(2, { topic: "weak.real", isCorrect: false }),
      attempt(3, { topic: "weak.real", isCorrect: false }),
      attempt(4, { topic: "weak.real", isCorrect: false })
    ];
    const r = aggregateProgress("u1", xs);
    expect(r.topWeaknesses.map((t) => t.topicKey)).toEqual(["weak.real"]);
  });

  it("classifies a topic with high hint-reliance but OK accuracy as a weakness", () => {
    // Accuracy 100% but used 2 hints per attempt → friction-based weakness.
    const xs = [
      attempt(1, { topic: "high.friction", isCorrect: true, hints: 2 }),
      attempt(2, { topic: "high.friction", isCorrect: true, hints: 2 }),
      attempt(3, { topic: "high.friction", isCorrect: true, hints: 2 })
    ];
    const r = aggregateProgress("u1", xs);
    expect(r.topWeaknesses.map((t) => t.topicKey)).toEqual(["high.friction"]);
  });

  it("does NOT count the same topic in both strength and weakness", () => {
    // Accuracy 100%, but with high hints — by the rules, hints > 1.5 means
    // it goes to weaknesses (friction-based); should NOT also be in strengths.
    // Strength criterion is accuracy ≥ 0.7 AND attempts ≥ 3 — so 100% passes.
    // We want to make sure our rule excludes it from strengths. We do this
    // by checking: if it's in weaknesses, it shouldn't also be in strengths.
    const xs = [
      attempt(1, { topic: "mixed", isCorrect: true, hints: 2 }),
      attempt(2, { topic: "mixed", isCorrect: true, hints: 2 }),
      attempt(3, { topic: "mixed", isCorrect: true, hints: 2 })
    ];
    const r = aggregateProgress("u1", xs);
    const inStrengths = r.topStrengths.some((t) => t.topicKey === "mixed");
    const inWeaknesses = r.topWeaknesses.some((t) => t.topicKey === "mixed");
    // Current implementation: topStrengths uses accuracy ≥ 0.7 only — does
    // NOT exclude high-hint topics. So this could legitimately fire on both
    // lists. Document the expectation: at minimum, the WEAKNESS list catches it.
    expect(inWeaknesses).toBe(true);
    // If it also shows up in strengths, the UI will look incoherent.
    // We assert NOT to enforce the disjoint rule.
    expect(inStrengths).toBe(false);
  });

  it("orders byDifficulty as EASY → MEDIUM → HARD and drops empty bands", () => {
    const xs = [
      attempt(1, { difficulty: "HARD", isCorrect: true }),
      attempt(2, { difficulty: "EASY", isCorrect: true }),
      attempt(3, { difficulty: "EASY", isCorrect: false })
    ];
    const r = aggregateProgress("u1", xs);
    expect(r.byDifficulty.map((d) => d.difficultyBand)).toEqual(["EASY", "HARD"]);
    const easy = r.byDifficulty.find((d) => d.difficultyBand === "EASY")!;
    expect(easy.accuracy).toBe(0.5);
    expect(easy.attemptCount).toBe(2);
  });

  it("groups by contest, sorted by attemptCount desc", () => {
    const xs = [
      attempt(1, { contest: "AMC8" }),
      attempt(2, { contest: "AMC10" }),
      attempt(3, { contest: "AMC10" }),
      attempt(4, { contest: "AMC10" }),
      attempt(5, { contest: "AIME" })
    ];
    const r = aggregateProgress("u1", xs);
    expect(r.byContest.map((c) => c.contest)).toEqual(["AMC10", "AMC8", "AIME"]);
    expect(r.byContest[0].attemptCount).toBe(3);
  });

  it("counts distinct active days in the last 14, not the lifetime", () => {
    const xs = [
      // 3 distinct days in the last week
      attempt(1, { daysAgo: 0 }),
      attempt(2, { daysAgo: 1 }),
      attempt(3, { daysAgo: 1 }), // same day as #2
      attempt(4, { daysAgo: 5 }),
      // 1 day from 30 days ago — should NOT count
      attempt(5, { daysAgo: 30 })
    ];
    const r = aggregateProgress("u1", xs);
    expect(r.activeDaysLast14).toBe(3);
  });

  it("daysSinceFirstAttempt is at least 1", () => {
    const r = aggregateProgress("u1", [attempt(1, { daysAgo: 0 })]);
    expect(r.daysSinceFirstAttempt).toBeGreaterThanOrEqual(1);
  });

  it("daysSinceFirstAttempt reflects oldest attempt", () => {
    const r = aggregateProgress("u1", [
      attempt(1, { daysAgo: 0 }),
      attempt(2, { daysAgo: 10 }),
      attempt(3, { daysAgo: 30 })
    ]);
    expect(r.daysSinceFirstAttempt).toBeGreaterThanOrEqual(29);
    expect(r.daysSinceFirstAttempt).toBeLessThanOrEqual(31);
  });

  it("ignores attempts with null topicKey when building byTopic", () => {
    const xs = [
      attempt(1, { topic: null }),
      attempt(2, { topic: "algebra.x" }),
      attempt(3, { topic: "algebra.x" })
    ];
    const r = aggregateProgress("u1", xs);
    expect(r.byTopic.map((t) => t.topicKey)).toEqual(["algebra.x"]);
  });
});

// --- buildPlanPrompt -------------------------------------------------------

describe("buildPlanPrompt", () => {
  const baseAgg = aggregateProgress("u1", [
    attempt(1, { topic: "algebra.x", isCorrect: true }),
    attempt(2, { topic: "algebra.x", isCorrect: true }),
    attempt(3, { topic: "algebra.x", isCorrect: true })
  ]);

  it("includes the current prompt version (for caching / debugging)", () => {
    const p = buildPlanPrompt(baseAgg, "en");
    expect(p).toContain(STUDENT_PROGRESS_PROMPT_VERSION);
  });

  it("includes the strict-scope category list", () => {
    const p = buildPlanPrompt(baseAgg, "en");
    expect(p).toContain("STRICT SCOPE");
    expect(p).toContain("(A) WHICH math knowledge points");
    expect(p).toContain("(B) HOW to practice");
    expect(p).toContain("(C) HOW MUCH time");
  });

  it("lists every forbidden category by name so the model can't drift", () => {
    const p = buildPlanPrompt(baseAgg, "en");
    // Sleep / mindset / generic encouragement / admissions / off-platform
    // should all be in the explicit forbid list — drift on any of these
    // would break the user's scope contract.
    expect(p).toContain("FORBIDDEN");
    expect(p).toMatch(/Sleep/);
    expect(p).toMatch(/mindset|confidence|motivation/);
    expect(p).toMatch(/College admissions/);
    expect(p).toMatch(/Test-day strategy/);
    expect(p).toMatch(/tutors|coaches|teachers/);
    expect(p).toMatch(/Other platforms/);
    expect(p).toMatch(/Career advice/);
    expect(p).toMatch(/Generic encouragement/);
  });

  it("explicitly forbids inventing numbers", () => {
    const p = buildPlanPrompt(baseAgg, "en");
    expect(p).toContain("Never invent numbers");
  });

  it("forbids exclamation marks (no cheerleader voice)", () => {
    const p = buildPlanPrompt(baseAgg, "en");
    expect(p).toContain("no exclamation marks");
  });

  it("locale rule reflects the language argument", () => {
    expect(buildPlanPrompt(baseAgg, "en")).toContain("Reply in English");
    expect(buildPlanPrompt(baseAgg, "zh")).toContain("Reply in Mandarin Chinese");
  });

  it("inlines the snapshot numbers so the model is grounded", () => {
    const p = buildPlanPrompt(baseAgg, "en");
    // totalAttempts and accuracy should be in the JSON payload
    expect(p).toMatch(/"totalAttempts":\s*3/);
    expect(p).toMatch(/"accuracy":\s*1/);
  });
});

// --- getFallbackPlan -------------------------------------------------------

describe("getFallbackPlan", () => {
  it("returns Chinese text when locale is zh", () => {
    const agg = aggregateProgress("u1", [attempt(1)]);
    const plan = getFallbackPlan(agg, "zh");
    // Must contain Chinese characters in summary
    expect(plan.summary).toMatch(/[一-龥]/);
    expect(plan.milestoneGoal).toMatch(/[一-龥]/);
  });

  it("returns English text when locale is en", () => {
    const agg = aggregateProgress("u1", [attempt(1)]);
    const plan = getFallbackPlan(agg, "en");
    // No CJK in summary
    expect(plan.summary).not.toMatch(/[一-龥]/);
  });

  it("nextMoves stays within the allowed scope (action-y verbs, no banned topics)", () => {
    const agg = aggregateProgress("u1", [attempt(1)]);
    const en = getFallbackPlan(agg, "en");
    const zh = getFallbackPlan(agg, "zh");
    const banned = [
      /sleep/i,
      /confidence/i,
      /tutor/i,
      /admission/i,
      /career/i,
      /mindset/i,
      /motivation/i,
      /classmate|friend|buddy/i
    ];
    for (const move of [...en.nextMoves, ...zh.nextMoves]) {
      for (const pattern of banned) {
        expect(move, `move "${move}" should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("milestoneGoal mentions a measurable quantity", () => {
    const agg = aggregateProgress("u1", [
      attempt(1, { isCorrect: true }),
      attempt(2, { isCorrect: false })
    ]);
    const plan = getFallbackPlan(agg, "en");
    // Should contain a percentage or a problem count number
    expect(plan.milestoneGoal).toMatch(/\d/);
  });
});

// --- Phase B: snapshot helpers --------------------------------------------

describe("startOfIsoWeek", () => {
  it("returns a Monday for a Wednesday", () => {
    // Wednesday 2026-05-20 (any time)
    const wed = new Date("2026-05-20T15:42:00Z");
    const monday = startOfIsoWeek(wed);
    expect(monday.getUTCDay()).toBe(1); // Monday
    expect(monday.toISOString()).toBe("2026-05-18T00:00:00.000Z");
  });

  it("returns the same Monday when given a Monday", () => {
    const mon = new Date("2026-05-18T00:00:00Z");
    const monday = startOfIsoWeek(mon);
    expect(monday.toISOString()).toBe("2026-05-18T00:00:00.000Z");
  });

  it("rolls back across Sunday correctly", () => {
    // Sunday 2026-05-24 → the previous Monday is 2026-05-18
    const sun = new Date("2026-05-24T23:59:59Z");
    const monday = startOfIsoWeek(sun);
    expect(monday.toISOString()).toBe("2026-05-18T00:00:00.000Z");
  });

  it("normalizes time-of-day to 00:00", () => {
    const noon = new Date("2026-05-20T12:00:00Z");
    const monday = startOfIsoWeek(noon);
    expect(monday.getUTCHours()).toBe(0);
    expect(monday.getUTCMinutes()).toBe(0);
    expect(monday.getUTCSeconds()).toBe(0);
    expect(monday.getUTCMilliseconds()).toBe(0);
  });
});

// --- Phase C: mastery levels + recommendations ---------------------------

describe("computeMasteryLevel", () => {
  it("returns 0 for no attempts", () => {
    expect(computeMasteryLevel({ attemptCount: 0, accuracy: 0 })).toBe(0);
  });

  it("returns 1 for 1-2 attempts regardless of accuracy", () => {
    expect(computeMasteryLevel({ attemptCount: 1, accuracy: 1.0 })).toBe(1);
    expect(computeMasteryLevel({ attemptCount: 2, accuracy: 0.5 })).toBe(1);
  });

  it("returns 2 when accuracy < 50% with enough attempts", () => {
    expect(computeMasteryLevel({ attemptCount: 5, accuracy: 0.3 })).toBe(2);
    expect(computeMasteryLevel({ attemptCount: 10, accuracy: 0.4 })).toBe(2);
  });

  it("caps small samples at level 3 even with perfect accuracy", () => {
    expect(computeMasteryLevel({ attemptCount: 3, accuracy: 1.0 })).toBe(3);
    expect(computeMasteryLevel({ attemptCount: 5, accuracy: 1.0 })).toBe(3);
  });

  it("returns 3 for 6+ attempts at 70-85% accuracy", () => {
    expect(computeMasteryLevel({ attemptCount: 6, accuracy: 0.75 })).toBe(3);
    expect(computeMasteryLevel({ attemptCount: 8, accuracy: 0.83 })).toBe(3);
  });

  it("returns 4 for 6+ attempts at 85-95% accuracy", () => {
    expect(computeMasteryLevel({ attemptCount: 6, accuracy: 0.9 })).toBe(4);
    expect(computeMasteryLevel({ attemptCount: 9, accuracy: 0.94 })).toBe(4);
  });

  it("returns 5 only for 10+ attempts at >= 95%", () => {
    expect(computeMasteryLevel({ attemptCount: 10, accuracy: 0.95 })).toBe(5);
    expect(computeMasteryLevel({ attemptCount: 20, accuracy: 1.0 })).toBe(5);
  });

  it("does NOT return 5 for high accuracy with too few attempts", () => {
    // 8 attempts at 100% — proficient but not mastered (need 10+).
    expect(computeMasteryLevel({ attemptCount: 8, accuracy: 1.0 })).toBe(4);
  });

  it("intermediate band: 6+ attempts 70-85% → level 3", () => {
    expect(computeMasteryLevel({ attemptCount: 7, accuracy: 0.72 })).toBe(3);
  });

  it("level is monotone-ish in accuracy (sanity)", () => {
    // For a fixed attempt count, higher accuracy should never give
    // lower level.
    const levels = [0.1, 0.4, 0.6, 0.75, 0.9, 0.97].map((acc) =>
      computeMasteryLevel({ attemptCount: 12, accuracy: acc })
    );
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });
});

describe("recommendationFor", () => {
  it("recommends 'explore' for too-few-attempts topics", () => {
    expect(
      recommendationFor({ attemptCount: 1, accuracy: 1.0, hintsPerAttempt: 0, level: 1 })
    ).toBe("explore");
    expect(
      recommendationFor({ attemptCount: 2, accuracy: 0, hintsPerAttempt: 0, level: 1 })
    ).toBe("explore");
  });

  it("recommends 'review' for low mastery level", () => {
    expect(
      recommendationFor({ attemptCount: 8, accuracy: 0.3, hintsPerAttempt: 0, level: 2 })
    ).toBe("review");
  });

  it("recommends 'review' when hint reliance is high, even at good accuracy", () => {
    expect(
      recommendationFor({ attemptCount: 6, accuracy: 0.85, hintsPerAttempt: 2.5, level: 4 })
    ).toBe("review");
  });

  it("recommends 'progress' for solid mid-range mastery", () => {
    expect(
      recommendationFor({ attemptCount: 8, accuracy: 0.8, hintsPerAttempt: 0.5, level: 3 })
    ).toBe("progress");
    expect(
      recommendationFor({ attemptCount: 10, accuracy: 0.9, hintsPerAttempt: 0.5, level: 4 })
    ).toBe("progress");
  });

  it("recommends 'advance' for level 5 mastery", () => {
    expect(
      recommendationFor({ attemptCount: 12, accuracy: 0.97, hintsPerAttempt: 0, level: 5 })
    ).toBe("advance");
  });
});

describe("computeTopicMastery", () => {
  const slice = (over: Partial<TopicSlice> = {}): TopicSlice => ({
    topicKey: "algebra.x",
    label: "Algebra / X",
    attemptCount: 5,
    correctCount: 4,
    accuracy: 0.8,
    hintsPerAttempt: 0.4,
    ...over
  });

  it("returns one entry per topic, sorted by attempts desc", () => {
    const result = computeTopicMastery([
      slice({ topicKey: "a", attemptCount: 3 }),
      slice({ topicKey: "b", attemptCount: 10 }),
      slice({ topicKey: "c", attemptCount: 5 })
    ]);
    expect(result.map((t) => t.topicKey)).toEqual(["b", "c", "a"]);
  });

  it("preserves topic label and stats", () => {
    const result = computeTopicMastery([
      slice({ topicKey: "geom.tri", label: "Geometry / Tri", attemptCount: 7, accuracy: 0.9 })
    ]);
    expect(result[0]).toMatchObject({
      topicKey: "geom.tri",
      label: "Geometry / Tri",
      attempts: 7,
      accuracy: 0.9
    });
  });

  it("returns empty array for empty input", () => {
    expect(computeTopicMastery([])).toEqual([]);
  });

  it("attaches both level and recommendation per topic", () => {
    const result = computeTopicMastery([
      slice({ topicKey: "weak", attemptCount: 10, accuracy: 0.3, correctCount: 3 }),
      slice({ topicKey: "strong", attemptCount: 12, accuracy: 0.97, correctCount: 12 })
    ]);
    const weak = result.find((t) => t.topicKey === "weak")!;
    const strong = result.find((t) => t.topicKey === "strong")!;
    expect(weak.level).toBe(2);
    expect(weak.recommendation).toBe("review");
    expect(strong.level).toBe(5);
    expect(strong.recommendation).toBe("advance");
  });
});

describe("selectDifficultyTargetForTopic", () => {
  it("bootstraps with EASY when MEDIUM has no data", () => {
    expect(
      selectDifficultyTargetForTopic({ accuracy: 0.6, attemptCount: 4 }, [])
    ).toBe("EASY");
  });

  it("stays with EASY when topic itself is very weak", () => {
    expect(
      selectDifficultyTargetForTopic(
        { accuracy: 0.2, attemptCount: 5 },
        [{ difficultyBand: "MEDIUM", attemptCount: 5, correctCount: 4, accuracy: 0.8 }]
      )
    ).toBe("EASY");
  });

  it("recommends MEDIUM when student is in the 50-70% medium band", () => {
    expect(
      selectDifficultyTargetForTopic(
        { accuracy: 0.6, attemptCount: 8 },
        [{ difficultyBand: "MEDIUM", attemptCount: 10, correctCount: 6, accuracy: 0.6 }]
      )
    ).toBe("MEDIUM");
  });

  it("pushes to HARD when MEDIUM is mastered", () => {
    expect(
      selectDifficultyTargetForTopic(
        { accuracy: 0.85, attemptCount: 8 },
        [{ difficultyBand: "MEDIUM", attemptCount: 10, correctCount: 8, accuracy: 0.8 }]
      )
    ).toBe("HARD");
  });

  it("stays on MEDIUM when MEDIUM accuracy is below 50%", () => {
    expect(
      selectDifficultyTargetForTopic(
        { accuracy: 0.5, attemptCount: 6 },
        [{ difficultyBand: "MEDIUM", attemptCount: 8, correctCount: 3, accuracy: 0.375 }]
      )
    ).toBe("MEDIUM");
  });
});

describe("isSnapshotDue", () => {
  it("is true when there is no prior snapshot", () => {
    expect(isSnapshotDue(null, new Date())).toBe(true);
  });

  it("is false when the last snapshot is recent (< 6 days)", () => {
    const now = new Date("2026-05-25T10:00:00Z");
    const recent = new Date("2026-05-22T10:00:00Z"); // 3 days ago
    expect(isSnapshotDue(recent, now)).toBe(false);
  });

  it("is true when the last snapshot is ≥ 6 days old", () => {
    const now = new Date("2026-05-25T10:00:00Z");
    const old = new Date("2026-05-19T10:00:00Z"); // exactly 6 days ago
    expect(isSnapshotDue(old, now)).toBe(true);
  });

  it("is true when the last snapshot is much older", () => {
    const now = new Date("2026-05-25T10:00:00Z");
    const ancient = new Date("2026-01-01T10:00:00Z");
    expect(isSnapshotDue(ancient, now)).toBe(true);
  });
});
