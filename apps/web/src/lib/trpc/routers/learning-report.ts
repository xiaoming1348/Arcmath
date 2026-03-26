import type { Contest } from "@arcmath/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "@/lib/trpc/server";
import {
  buildDiagnosticProblemSetWhere,
  buildRealExamProblemSetWhere,
  buildTopicPracticeProblemSetWhere,
  getTutorUsableSetKind
} from "@/lib/tutor-usable-sets";

const RECENT_ATTEMPT_LIMIT = 25;
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

      const attempts = await ctx.prisma.problemAttempt.findMany({
        where: {
          userId,
          ...(practiceRun ? { practiceRunId: practiceRun.id } : {})
        },
        orderBy: {
          createdAt: "desc"
        },
        ...(practiceRun ? {} : { take: RECENT_ATTEMPT_LIMIT }),
        select: {
          id: true,
          problemId: true,
          submittedAnswer: true,
          normalizedAnswer: true,
          isCorrect: true,
          createdAt: true,
          problem: {
            select: {
              number: true,
              statement: true,
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
          reportScope: buildReportScope(practiceRun)
        };
      }

      const problemIds = Array.from(new Set(attempts.map((attempt) => attempt.problemId)));
      const oldestAttemptAt = attempts.at(-1)?.createdAt ?? attempts[attempts.length - 1].createdAt;

      const hintUsages = await ctx.prisma.problemHintUsage.findMany({
        where: {
          userId,
          ...(practiceRun ? { practiceRunId: practiceRun.id } : {}),
          problemId: {
            in: problemIds
          },
          ...(practiceRun
            ? {}
            : {
                createdAt: {
                  gte: oldestAttemptAt
                }
              })
        },
        select: {
          problemId: true,
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
          submittedAnswer: attempt.submittedAnswer,
          normalizedAnswer: attempt.normalizedAnswer,
          isCorrect: attempt.isCorrect,
          createdAt: toIsoString(attempt.createdAt),
          problem: {
            number: attempt.problem.number,
            statement: attempt.problem.statement,
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

      return {
        userId,
        generatedAt: new Date().toISOString(),
        attempts: normalizedAttempts,
        recommendedProblems,
        reportScope: buildReportScope(practiceRun)
      };
    })
});
