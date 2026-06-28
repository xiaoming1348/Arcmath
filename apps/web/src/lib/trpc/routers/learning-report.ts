import type { Contest } from "@arcmath/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "@/lib/trpc/server";
import { generateRevisitInsight } from "@/lib/ai/revisit-insight";
import { resolveFeedbackLocaleForUser } from "@/i18n/server";
import {
  buildDiagnosticProblemSetWhere,
  buildRealExamProblemSetWhere,
  buildTopicPracticeProblemSetWhere,
  getTutorUsableSetKind
} from "@/lib/tutor-usable-sets";

/**
 * The "latest report" mode (no runId in URL) aggregates across the
 * user's most recent N distinct ProblemSets — one PracticeRun per set
 * (their most recent completed run for that set). This is a bigger
 * window than the old single-25-attempt cutoff so the headline
 * accuracy + hint stats reflect a real trend, not just one bad day.
 *
 * Picking distinct sets (not runs) prevents a student who replays
 * AMC 10 2020 three times from drowning out the other sets they've
 * worked on.
 */
const RECENT_DISTINCT_SET_LIMIT = 5;
const RECOMMENDED_PROBLEM_LIMIT = 3;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function difficultyRank(value: string | null): number {
  if (value === "EASY") {
    return 0;
  }

  if (value === "MEDIUM") {
    return 1;
  }

  if (value === "HARD") {
    return 2;
  }

  return 99;
}

function makeStatementSnippet(statement: string | null): string {
  const normalized = (statement ?? "Untitled problem").replace(/\s+/g, " ").trim();

  if (normalized.length <= 96) {
    return normalized;
  }

  return `${normalized.slice(0, 93)}...`;
}

function buildReportScope(
  practiceRun:
    | {
        id: string;
        organizationId: string | null;
        problemSetId: string;
        completedAt: Date | null;
        problemSet: {
          title: string;
          contest: Contest;
          year: number;
          exam: string | null;
          category: "DIAGNOSTIC" | "REAL_EXAM" | "TOPIC_PRACTICE";
          submissionMode: "WHOLE_SET_SUBMIT" | "PER_PROBLEM";
          tutorEnabled: boolean;
          sourceUrl: string | null;
        };
      }
    | null
) {
  if (!practiceRun) {
    return {
      type: "recent" as const,
      practiceRunId: null,
      organizationId: null,
      problemSetId: null,
      problemSetTitle: null,
      problemSetLabel: null,
      completedAt: null,
      isDiagnostic: false
    };
  }

  return {
    type: "practice-run" as const,
    practiceRunId: practiceRun.id,
    organizationId: practiceRun.organizationId,
    problemSetId: practiceRun.problemSetId,
    problemSetTitle: practiceRun.problemSet.title,
    problemSetLabel:
      practiceRun.problemSet.category === "DIAGNOSTIC"
        ? null
        : `${practiceRun.problemSet.contest} ${practiceRun.problemSet.year}${practiceRun.problemSet.exam ? ` ${practiceRun.problemSet.exam}` : ""}`,
    completedAt: practiceRun.completedAt ? toIsoString(practiceRun.completedAt) : null,
    isDiagnostic: practiceRun.problemSet.category === "DIAGNOSTIC"
  };
}

function buildRecommendedProblemQuery(params: {
  problemSetWhere:
    | ReturnType<typeof buildDiagnosticProblemSetWhere>
    | ReturnType<typeof buildRealExamProblemSetWhere>
    | ReturnType<typeof buildTopicPracticeProblemSetWhere>;
  topicKey?: string | null;
  preferEasy?: boolean;
  excludedProblemIds: string[];
  includeAttemptedFallback?: boolean;
}) {
  return {
    where: {
      problemSet: params.problemSetWhere,
      ...(params.topicKey ? { topicKey: params.topicKey } : {}),
      ...(params.preferEasy ? { difficultyBand: "EASY" } : {}),
      ...(params.includeAttemptedFallback ? {} : { id: { notIn: params.excludedProblemIds } })
    },
    orderBy: [{ problemSetId: "asc" as const }, { number: "asc" as const }],
    take: RECOMMENDED_PROBLEM_LIMIT,
    select: {
      id: true,
      number: true,
      topicKey: true,
      difficultyBand: true,
      statement: true
    }
  };
}

export const learningReportRouter = router({
  getLatestReportInput: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).optional()
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const practiceRun = input.runId
        ? await ctx.prisma.practiceRun.findFirst({
            where: {
              id: input.runId,
              userId
            },
            select: {
              id: true,
              organizationId: true,
              problemSetId: true,
              completedAt: true,
              problemSet: {
                select: {
                  title: true,
                  contest: true,
                  year: true,
                  exam: true,
                  category: true,
                  submissionMode: true,
                  tutorEnabled: true,
                  sourceUrl: true
                }
              }
            }
          })
        : null;

      if (input.runId && !practiceRun) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Practice run not found."
        });
      }

      // In latest mode, look up the user's most recent N distinct
      // ProblemSets (one most-recent completed PracticeRun per set).
      // Skipped in run-scoped mode where we already have the run.
      type RecentRunRow = {
        id: string;
        problemSetId: string;
        completedAt: Date;
        problemSet: {
          title: string;
          contest: Contest;
          year: number;
          exam: string | null;
          category: "DIAGNOSTIC" | "REAL_EXAM" | "TOPIC_PRACTICE";
        };
      };

      let recentRunsForLatest: RecentRunRow[] = [];
      if (!practiceRun) {
        // Pull a generous window of completed runs and dedupe in code.
        // 50 is enough for a typical student (who rarely has more than
        // a few distinct sets in a month); we stop once we've collected
        // RECENT_DISTINCT_SET_LIMIT distinct problemSetIds.
        const candidateRuns = await ctx.prisma.practiceRun.findMany({
          where: {
            userId,
            completedAt: { not: null }
          },
          orderBy: { completedAt: "desc" },
          take: 50,
          select: {
            id: true,
            problemSetId: true,
            completedAt: true,
            problemSet: {
              select: {
                title: true,
                contest: true,
                year: true,
                exam: true,
                category: true
              }
            }
          }
        });

        const seenSetIds = new Set<string>();
        for (const run of candidateRuns) {
          if (!run.completedAt) continue;
          if (seenSetIds.has(run.problemSetId)) continue;
          seenSetIds.add(run.problemSetId);
          recentRunsForLatest.push({
            id: run.id,
            problemSetId: run.problemSetId,
            completedAt: run.completedAt,
            problemSet: run.problemSet
          });
          if (recentRunsForLatest.length >= RECENT_DISTINCT_SET_LIMIT) break;
        }
      }

      const recentRunIds = recentRunsForLatest.map((run) => run.id);

      const attempts = await ctx.prisma.problemAttempt.findMany({
        where: {
          userId,
          // Run-scoped: only attempts in this run.
          // Latest: only attempts in the N most-recent distinct-set runs.
          //   If recentRunIds is empty (new student, no completed runs),
          //   fall through to "no attempts" branch.
          ...(practiceRun
            ? { practiceRunId: practiceRun.id }
            : { practiceRunId: { in: recentRunIds } })
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          problemId: true,
          // practiceRunId is needed downstream so the report page can
          // group attempts by run for the per-set trend chart and the
          // "revisit wrong answers" view.
          practiceRunId: true,
          submittedAnswer: true,
          normalizedAnswer: true,
          isCorrect: true,
          // status is what makes "unfinished" first-class: DRAFT means the
          // student opened the problem but never submitted, so it should
          // never count as incorrect.
          status: true,
          createdAt: true,
          problem: {
            select: {
              number: true,
              statement: true,
              // statementFormat lets the UI render KaTeX instead of
              // dumping raw "$x^2 + 1$" strings on the page.
              statementFormat: true,
              answer: true,
              topicKey: true,
              difficultyBand: true,
              solutionSketch: true
            }
          }
        }
      });

      if (attempts.length === 0) {
        return {
          userId,
          generatedAt: new Date().toISOString(),
          attempts: [],
          recommendedProblems: [],
          reportScope: buildReportScope(practiceRun),
          recentRuns: [],
          topicTrends: []
        };
      }

      const problemIds = Array.from(new Set(attempts.map((attempt) => attempt.problemId)));

      // Scope hint usages to the same runs we pulled attempts from. In
      // run-scoped mode that's one run; in latest mode that's the 5
      // distinct-set runs.
      //
      // The old query used a createdAt window keyed off the oldest
      // attempt; that worked but pulled in stray hint requests for
      // problems shared across sets. Filtering by practiceRunId is
      // exact and cheaper.
      const hintUsages = await ctx.prisma.problemHintUsage.findMany({
        where: {
          userId,
          ...(practiceRun
            ? { practiceRunId: practiceRun.id }
            : { practiceRunId: { in: recentRunIds } }),
          problemId: {
            in: problemIds
          }
        },
        select: {
          problemId: true,
          practiceRunId: true,
          hintLevel: true
        }
      });

      const hintUsageByProblem = new Map<string, { hintUsageCount: number; highestHintLevel: number }>();

      for (const usage of hintUsages) {
        const current = hintUsageByProblem.get(usage.problemId) ?? {
          hintUsageCount: 0,
          highestHintLevel: 0
        };

        current.hintUsageCount += 1;
        current.highestHintLevel = Math.max(current.highestHintLevel, usage.hintLevel);
        hintUsageByProblem.set(usage.problemId, current);
      }

      const normalizedAttempts = attempts.map((attempt) => {
        const hintSummary = hintUsageByProblem.get(attempt.problemId) ?? {
          hintUsageCount: 0,
          highestHintLevel: 0
        };

        return {
          attemptId: attempt.id,
          problemId: attempt.problemId,
          practiceRunId: attempt.practiceRunId,
          submittedAnswer: attempt.submittedAnswer,
          normalizedAnswer: attempt.normalizedAnswer,
          isCorrect: attempt.isCorrect,
          status: attempt.status,
          createdAt: toIsoString(attempt.createdAt),
          problem: {
            number: attempt.problem.number,
            statement: attempt.problem.statement,
            statementFormat: attempt.problem.statementFormat,
            correctAnswer: attempt.problem.answer,
            topicKey: attempt.problem.topicKey,
            difficultyBand: attempt.problem.difficultyBand,
            solutionSketch: attempt.problem.solutionSketch
          },
          hintUsageCount: hintSummary.hintUsageCount,
          highestHintLevel: hintSummary.highestHintLevel
        };
      });

      const totalCorrect = normalizedAttempts.filter((attempt) => attempt.isCorrect).length;
      const recentAccuracy = normalizedAttempts.length > 0 ? totalCorrect / normalizedAttempts.length : 0;
      const topicScores = new Map<string, number>();
      const topicStats = new Map<
        string,
        {
          incorrectCount: number;
          highHintCount: number;
          highestHintLevelThreeCount: number;
          mediumOrHardWeakCount: number;
          difficultyBands: Set<string>;
        }
      >();

      for (const attempt of normalizedAttempts) {
        const topicKey = attempt.problem.topicKey;
        if (!topicKey) {
          continue;
        }

        const currentScore = topicScores.get(topicKey) ?? 0;
        let delta = 0;
        const difficultyWeight =
          attempt.problem.difficultyBand === "HARD" ? 2 : attempt.problem.difficultyBand === "MEDIUM" ? 1 : 0;

        if (!attempt.isCorrect) {
          delta += 2 + difficultyWeight;
        }

        if (attempt.hintUsageCount >= 2) {
          delta += 1 + difficultyWeight;
        }

        if (attempt.highestHintLevel >= 3) {
          delta += 2 + difficultyWeight;
        }

        topicScores.set(topicKey, currentScore + delta);

        const stats = topicStats.get(topicKey) ?? {
          incorrectCount: 0,
          highHintCount: 0,
          highestHintLevelThreeCount: 0,
          mediumOrHardWeakCount: 0,
          difficultyBands: new Set<string>()
        };

        if (!attempt.isCorrect) {
          stats.incorrectCount += 1;
        }

        if (attempt.hintUsageCount >= 2 || attempt.highestHintLevel >= 3) {
          stats.highHintCount += 1;
        }

        if (attempt.highestHintLevel >= 3) {
          stats.highestHintLevelThreeCount += 1;
        }

        if (
          difficultyWeight > 0 &&
          (!attempt.isCorrect || attempt.hintUsageCount >= 2 || attempt.highestHintLevel >= 3)
        ) {
          stats.mediumOrHardWeakCount += 1;
        }

        if (attempt.problem.difficultyBand) {
          stats.difficultyBands.add(attempt.problem.difficultyBand);
        }

        topicStats.set(topicKey, stats);
      }

      const reinforcementTopics = Array.from(topicScores.entries())
        .filter(([, score]) => score > 0)
        .sort((left, right) => right[1] - left[1])
        .map(([topicKey]) => topicKey);

      const primaryTopic =
        reinforcementTopics[0] ??
        normalizedAttempts.find((attempt) => attempt.problem.topicKey !== null)?.problem.topicKey ??
        null;
      const primaryTopicStats = primaryTopic ? topicStats.get(primaryTopic) ?? null : null;
      const shouldPreferEasy =
        recentAccuracy < 0.7 ||
        !!primaryTopicStats?.mediumOrHardWeakCount ||
        !!primaryTopicStats?.highestHintLevelThreeCount ||
        (primaryTopicStats?.highHintCount ?? 0) >= 2 ||
        (primaryTopicStats?.incorrectCount ?? 0) >= 2;
      const attemptedProblemIds = new Set(normalizedAttempts.map((attempt) => attempt.problemId));
      const secondaryTopic = reinforcementTopics[1] ?? null;
      const excludedProblemIds = Array.from(attemptedProblemIds);
      const preferredProblemSetWhere =
        practiceRun && getTutorUsableSetKind(practiceRun.problemSet) === "real_exam"
          ? buildRealExamProblemSetWhere()
          : buildTopicPracticeProblemSetWhere();
      const fallbackProblemSetWhere = buildTopicPracticeProblemSetWhere();

      const candidateBatches = await Promise.all([
        ctx.prisma.problem.findMany(
          buildRecommendedProblemQuery({
            problemSetWhere: preferredProblemSetWhere,
            topicKey: primaryTopic,
            preferEasy: shouldPreferEasy,
            excludedProblemIds
          })
        ),
        ctx.prisma.problem.findMany(
          buildRecommendedProblemQuery({
            problemSetWhere: preferredProblemSetWhere,
            topicKey: secondaryTopic ?? "__never__",
            preferEasy: shouldPreferEasy,
            excludedProblemIds
          })
        ),
        ctx.prisma.problem.findMany(
          buildRecommendedProblemQuery({
            problemSetWhere: preferredProblemSetWhere,
            topicKey: primaryTopic,
            excludedProblemIds
          })
        ),
        ctx.prisma.problem.findMany(
          buildRecommendedProblemQuery({
            problemSetWhere: fallbackProblemSetWhere,
            topicKey: primaryTopic,
            preferEasy: shouldPreferEasy,
            excludedProblemIds
          })
        ),
        ctx.prisma.problem.findMany(
          buildRecommendedProblemQuery({
            problemSetWhere: fallbackProblemSetWhere,
            preferEasy: shouldPreferEasy,
            excludedProblemIds
          })
        ),
        ctx.prisma.problem.findMany(
          buildRecommendedProblemQuery({
            problemSetWhere: fallbackProblemSetWhere,
            topicKey: primaryTopic,
            excludedProblemIds,
            includeAttemptedFallback: true
          })
        )
      ]);

      const recommendedProblems: Array<{
        problemId: string;
        number: number;
        topicKey: string | null;
        difficultyBand: string | null;
        statementSnippet: string;
      }> = [];

      for (const batch of candidateBatches) {
        for (const problem of batch) {
          if (recommendedProblems.some((item) => item.problemId === problem.id)) {
            continue;
          }

          recommendedProblems.push({
            problemId: problem.id,
            number: problem.number,
            topicKey: problem.topicKey,
            difficultyBand: problem.difficultyBand,
            statementSnippet: makeStatementSnippet(problem.statement)
          });

          if (recommendedProblems.length >= RECOMMENDED_PROBLEM_LIMIT) {
            break;
          }
        }

        if (recommendedProblems.length >= RECOMMENDED_PROBLEM_LIMIT) {
          break;
        }
      }

      recommendedProblems.sort((left, right) => {
        const isLeftPrimary = left.topicKey === primaryTopic ? 1 : 0;
        const isRightPrimary = right.topicKey === primaryTopic ? 1 : 0;
        if (isRightPrimary !== isLeftPrimary) {
          return isRightPrimary - isLeftPrimary;
        }

        const topicScoreDelta =
          (right.topicKey ? topicScores.get(right.topicKey) ?? 0 : -1) -
          (left.topicKey ? topicScores.get(left.topicKey) ?? 0 : -1);

        if (topicScoreDelta !== 0) {
          return topicScoreDelta;
        }

        const difficultyDelta = difficultyRank(left.difficultyBand) - difficultyRank(right.difficultyBand);
        if (difficultyDelta !== 0) {
          return difficultyDelta;
        }

        return left.number - right.number;
      });

      // Build the per-run aggregate the chart + sidebar consume.
      // Run-scoped reports emit a single-entry array (the run itself);
      // latest reports emit up to RECENT_DISTINCT_SET_LIMIT entries
      // ordered most-recent-first.
      //
      // accuracy is computed over SUBMITTED attempts only — drafts /
      // abandoned attempts shouldn't drag the percentage down.
      // Per-set topic distribution of WRONG / UNFINISHED attempts.
      // Drives the "5 wrong: 3 Geometry/Triangles, 2 Algebra/..."
      // line under each set on /reports/revisit (the α part of the
      // Phase 4 report iteration). Pure statistical aggregation; no AI.
      function buildWrongTopicSummary(runId: string): Array<{
        topicKey: string;
        count: number;
      }> {
        const wrong = normalizedAttempts.filter(
          (a) =>
            a.practiceRunId === runId &&
            ((a.status === "SUBMITTED" && !a.isCorrect) || a.status === "DRAFT")
        );
        const counts = new Map<string, number>();
        for (const a of wrong) {
          const key = a.problem.topicKey ?? "uncategorized";
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return Array.from(counts.entries())
          .map(([topicKey, count]) => ({ topicKey, count }))
          .sort((l, r) => r.count - l.count);
      }

      const recentRuns: Array<{
        runId: string;
        problemSetId: string;
        problemSetTitle: string;
        problemSetLabel: string | null;
        completedAt: string;
        totalProblems: number;
        totalSubmitted: number;
        totalCorrect: number;
        accuracy: number;
        hintUsedCount: number;
        wrongTopicSummary: Array<{ topicKey: string; count: number }>;
      }> = [];

      if (practiceRun) {
        const runAttempts = normalizedAttempts.filter(
          (a) => a.practiceRunId === practiceRun.id
        );
        const submitted = runAttempts.filter((a) => a.status === "SUBMITTED");
        const correct = submitted.filter((a) => a.isCorrect).length;
        const hintUsed = hintUsages.filter(
          (h) => h.practiceRunId === practiceRun.id
        ).length;
        recentRuns.push({
          runId: practiceRun.id,
          problemSetId: practiceRun.problemSetId,
          problemSetTitle: practiceRun.problemSet.title,
          problemSetLabel:
            practiceRun.problemSet.category === "DIAGNOSTIC"
              ? null
              : `${practiceRun.problemSet.contest} ${practiceRun.problemSet.year}${practiceRun.problemSet.exam ? ` ${practiceRun.problemSet.exam}` : ""}`,
          completedAt: practiceRun.completedAt
            ? toIsoString(practiceRun.completedAt)
            : new Date().toISOString(),
          totalProblems: runAttempts.length,
          totalSubmitted: submitted.length,
          totalCorrect: correct,
          accuracy: submitted.length > 0 ? correct / submitted.length : 0,
          hintUsedCount: hintUsed,
          wrongTopicSummary: buildWrongTopicSummary(practiceRun.id)
        });
      } else {
        for (const run of recentRunsForLatest) {
          const runAttempts = normalizedAttempts.filter(
            (a) => a.practiceRunId === run.id
          );
          const submitted = runAttempts.filter((a) => a.status === "SUBMITTED");
          const correct = submitted.filter((a) => a.isCorrect).length;
          const hintUsed = hintUsages.filter(
            (h) => h.practiceRunId === run.id
          ).length;
          recentRuns.push({
            runId: run.id,
            problemSetId: run.problemSetId,
            problemSetTitle: run.problemSet.title,
            problemSetLabel:
              run.problemSet.category === "DIAGNOSTIC"
                ? null
                : `${run.problemSet.contest} ${run.problemSet.year}${run.problemSet.exam ? ` ${run.problemSet.exam}` : ""}`,
            completedAt: toIsoString(run.completedAt),
            totalProblems: runAttempts.length,
            totalSubmitted: submitted.length,
            totalCorrect: correct,
            accuracy: submitted.length > 0 ? correct / submitted.length : 0,
            hintUsedCount: hintUsed,
            wrongTopicSummary: buildWrongTopicSummary(run.id)
          });
        }
      }

      // γ: per-topic trend across the recent attempts.
      // For each topic with enough data, walk attempts in
      // chronological order and emit a point per attempt (1 if
      // correct, 0 if incorrect or unfinished). The frontend renders
      // each topic as a small sparkline so the student can see
      // "Algebra is going up, Geometry is flat" at a glance.
      //
      // Filter: only topics with >= 5 attempts to keep noise down.
      // Cap: top 6 topics by attempt count, so a single overview
      // section doesn't dominate the report.
      type TopicTrendPoint = {
        attemptId: string;
        isCorrect: boolean;
        createdAt: string;
      };
      const topicPointsMap = new Map<string, TopicTrendPoint[]>();
      // Walk attempts in chronological order (oldest → newest) so the
      // sparkline reads left = older, right = newest.
      const chronological = [...normalizedAttempts].sort(
        (l, r) =>
          new Date(l.createdAt).getTime() - new Date(r.createdAt).getTime()
      );
      for (const a of chronological) {
        if (a.status !== "SUBMITTED") continue;
        const key = a.problem.topicKey;
        if (!key) continue;
        const list = topicPointsMap.get(key) ?? [];
        list.push({
          attemptId: a.attemptId,
          isCorrect: a.isCorrect,
          createdAt: a.createdAt
        });
        topicPointsMap.set(key, list);
      }
      const TOPIC_TREND_MIN_ATTEMPTS = 5;
      const TOPIC_TREND_LIMIT = 6;
      const topicTrends = Array.from(topicPointsMap.entries())
        .filter(([, pts]) => pts.length >= TOPIC_TREND_MIN_ATTEMPTS)
        .map(([topicKey, points]) => {
          const correct = points.filter((p) => p.isCorrect).length;
          return {
            topicKey,
            totalAttempts: points.length,
            totalCorrect: correct,
            accuracy: correct / points.length,
            points
          };
        })
        .sort((l, r) => r.totalAttempts - l.totalAttempts)
        .slice(0, TOPIC_TREND_LIMIT);

      return {
        userId,
        generatedAt: new Date().toISOString(),
        attempts: normalizedAttempts,
        recommendedProblems,
        reportScope: buildReportScope(practiceRun),
        recentRuns,
        topicTrends
      };
    }),
  /**
   * β: on-demand AI insight for /reports/revisit.
   *
   * Pulls the same last-5-distinct-sets attempts that drive the
   * revisit page, builds a wrong-answer-focused prompt, and asks
   * OpenAI for a one-paragraph weak-point analysis. Returns null on
   * any failure (which the client renders as a soft 'try again later'
   * note rather than an error).
   *
   * Gated on user being authenticated (protectedProcedure). No
   * additional rate-limiting yet — the cost is bounded by the
   * student manually clicking the button. If abuse appears, add a
   * 1-call-per-minute throttle keyed by userId.
   */
  generateRevisitInsight: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Re-use the same query shape as getLatestReportInput to keep
    // the two views consistent.
    const candidateRuns = await ctx.prisma.practiceRun.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 50,
      select: {
        id: true,
        problemSetId: true,
        completedAt: true,
        problemSet: {
          select: {
            title: true,
            contest: true,
            year: true,
            exam: true,
            category: true
          }
        }
      }
    });

    const seenSetIds = new Set<string>();
    const recentDistinctRuns: typeof candidateRuns = [];
    for (const run of candidateRuns) {
      if (!run.completedAt) continue;
      if (seenSetIds.has(run.problemSetId)) continue;
      seenSetIds.add(run.problemSetId);
      recentDistinctRuns.push(run);
      if (recentDistinctRuns.length >= RECENT_DISTINCT_SET_LIMIT) break;
    }

    if (recentDistinctRuns.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Complete a practice set before requesting an AI insight."
      });
    }

    const runIds = recentDistinctRuns.map((r) => r.id);
    const attempts = await ctx.prisma.problemAttempt.findMany({
      where: {
        userId,
        practiceRunId: { in: runIds }
      },
      select: {
        problemId: true,
        practiceRunId: true,
        isCorrect: true,
        status: true,
        problem: {
          select: {
            statement: true,
            topicKey: true
          }
        }
      }
    });

    const language = await resolveFeedbackLocaleForUser(userId);

    const perSet: Parameters<typeof generateRevisitInsight>[0]["perSet"] = [];
    for (const run of recentDistinctRuns) {
      const runAttempts = attempts.filter(
        (a) => a.practiceRunId === run.id
      );
      const submitted = runAttempts.filter((a) => a.status === "SUBMITTED");
      const correct = submitted.filter((a) => a.isCorrect).length;
      const wrong = runAttempts.filter(
        (a) =>
          (a.status === "SUBMITTED" && !a.isCorrect) || a.status === "DRAFT"
      );
      const topicCounts = new Map<string, number>();
      for (const w of wrong) {
        const k = w.problem.topicKey ?? "uncategorized";
        topicCounts.set(k, (topicCounts.get(k) ?? 0) + 1);
      }
      const wrongTopics = Array.from(topicCounts.entries())
        .map(([topicKey, count]) => ({ topicKey, count }))
        .sort((l, r) => r.count - l.count);
      const sampleWrongStatements = wrong
        .map((w) => (w.problem.statement ?? "").replace(/\s+/g, " ").trim())
        .filter((s) => s.length > 0)
        .slice(0, 3);
      perSet.push({
        problemSetTitle: run.problemSet.title,
        problemSetLabel:
          run.problemSet.category === "DIAGNOSTIC"
            ? null
            : `${run.problemSet.contest} ${run.problemSet.year}${run.problemSet.exam ? ` ${run.problemSet.exam}` : ""}`,
        completedAt: run.completedAt!.toISOString(),
        accuracy: submitted.length > 0 ? correct / submitted.length : 0,
        totalSubmitted: submitted.length,
        totalCorrect: correct,
        wrongTopics,
        sampleWrongStatements
      });
    }

    const insight = await generateRevisitInsight({
      language: language === "zh" ? "zh" : "en",
      perSet
    });

    if (!insight) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "AI insight is temporarily unavailable. Please try again in a moment."
      });
    }
    return insight;
  })
});
