import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { appRouter } from "@/lib/trpc/router";

type MockAttempt = {
  id: string;
  userId: string;
  problemId: string;
  practiceRunId: string | null;
  submittedAnswer: string;
  normalizedAnswer: string | null;
  isCorrect: boolean;
  createdAt: Date;
  problem: {
    statement: string | null;
    topicKey: string | null;
    difficultyBand: string | null;
  };
};

type MockHintUsage = {
  userId: string;
  problemId: string;
  practiceRunId: string | null;
  hintLevel: number;
  createdAt: Date;
};

function makeSession(): Session {
  return {
    user: {
      id: "student_1",
      email: "student@example.com",
      role: "STUDENT"
    },
    expires: new Date(Date.now() + 60_000).toISOString()
  };
}

function createPrismaMock() {
  const attempts: MockAttempt[] = [
    {
      id: "attempt_run_1",
      userId: "student_1",
      problemId: "seed_hint_tutor_p1",
      practiceRunId: "run_1",
      submittedAnswer: "B",
      normalizedAnswer: "B",
      isCorrect: true,
      createdAt: new Date("2026-03-11T10:00:00.000Z"),
      problem: {
        statement: "If 2x + 3 = 11, what is the value of x?",
        topicKey: "algebra.linear_equations",
        difficultyBand: "EASY"
      }
    },
    {
      id: "attempt_run_2",
      userId: "student_1",
      problemId: "seed_hint_tutor_p2",
      practiceRunId: "run_1",
      submittedAnswer: "2",
      normalizedAnswer: "2",
      isCorrect: true,
      createdAt: new Date("2026-03-11T10:05:00.000Z"),
      problem: {
        statement: "What is the remainder when 17 is divided by 5?",
        topicKey: "number_theory.modular_arithmetic",
        difficultyBand: "EASY"
      }
    },
    {
      id: "attempt_outside_run",
      userId: "student_1",
      problemId: "seed_hint_tutor_v2_p3",
      practiceRunId: null,
      submittedAnswer: "1",
      normalizedAnswer: "1",
      isCorrect: true,
      createdAt: new Date("2026-03-11T10:10:00.000Z"),
      problem: {
        statement: "What is the remainder when 43 is divided by 6?",
        topicKey: "number_theory.modular_arithmetic",
        difficultyBand: "EASY"
      }
    }
  ];

  const hintUsages: MockHintUsage[] = [
    {
      userId: "student_1",
      problemId: "seed_hint_tutor_p2",
      practiceRunId: "run_1",
      hintLevel: 2,
      createdAt: new Date("2026-03-11T10:04:00.000Z")
    },
    {
      userId: "student_1",
      problemId: "seed_hint_tutor_v2_p3",
      practiceRunId: null,
      hintLevel: 3,
      createdAt: new Date("2026-03-11T10:09:00.000Z")
    }
  ];

  return {
    prisma: {
      practiceRun: {
        async findFirst(args: { where: { id: string; userId: string } }) {
          if (args.where.id !== "run_1" || args.where.userId !== "student_1") {
            return null;
          }

          return {
            id: "run_1",
            problemSetId: "seed_hint_tutor_set_v1",
            completedAt: new Date("2026-03-11T10:15:00.000Z"),
            problemSet: {
              title: "Hint Tutor Foundations",
              contest: "AMC10",
              year: 2099,
              exam: "A"
            }
          };
        }
      },
      problemAttempt: {
        async findMany(args: {
          where: {
            userId: string;
            practiceRunId?: string;
          };
          take?: number;
        }) {
          let filtered = attempts.filter((attempt) => attempt.userId === args.where.userId);

          if (args.where.practiceRunId) {
            filtered = filtered.filter((attempt) => attempt.practiceRunId === args.where.practiceRunId);
          }

          filtered.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

          if (typeof args.take === "number") {
            filtered = filtered.slice(0, args.take);
          }

          return filtered;
        }
      },
      problemHintUsage: {
        async findMany(args: {
          where: {
            userId: string;
            practiceRunId?: string;
            problemId: {
              in: string[];
            };
            createdAt?: {
              gte: Date;
            };
          };
        }) {
          return hintUsages.filter((usage) => {
            if (usage.userId !== args.where.userId) {
              return false;
            }

            if (args.where.practiceRunId && usage.practiceRunId !== args.where.practiceRunId) {
              return false;
            }

            if (!args.where.problemId.in.includes(usage.problemId)) {
              return false;
            }

            if (args.where.createdAt?.gte && usage.createdAt < args.where.createdAt.gte) {
              return false;
            }

            return true;
          });
        }
      },
      problem: {
        async findMany() {
          return [];
        }
      }
    }
  };
}

describe("learningReport router", () => {
  it("scopes report input to the requested practice run", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession(),
      prisma: mock.prisma as never
    });

    const result = await caller.learningReport.getLatestReportInput({
      runId: "run_1"
    });

    expect(result.reportScope).toMatchObject({
      type: "practice-run",
      practiceRunId: "run_1",
      problemSetId: "seed_hint_tutor_set_v1",
      problemSetTitle: "Hint Tutor Foundations"
    });
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts.map((attempt) => attempt.problemId)).toEqual(["seed_hint_tutor_p2", "seed_hint_tutor_p1"]);
    expect(result.attempts.some((attempt) => attempt.problemId === "seed_hint_tutor_v2_p3")).toBe(false);
    expect(result.attempts[0]).toMatchObject({
      problemId: "seed_hint_tutor_p2",
      hintUsageCount: 1,
      highestHintLevel: 2
    });
  });
});
