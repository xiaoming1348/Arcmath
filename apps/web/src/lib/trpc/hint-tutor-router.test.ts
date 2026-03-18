import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { appRouter } from "@/lib/trpc/router";

type MockProblem = {
  id: string;
  problemSetId: string;
  answer: string | null;
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";
  choices?: unknown;
  statement?: string | null;
  diagramImageAlt?: string | null;
  solutionSketch?: string | null;
  curatedHintLevel1?: string | null;
  curatedHintLevel2?: string | null;
  curatedHintLevel3?: string | null;
  generatedHintLevel1?: string | null;
  generatedHintLevel2?: string | null;
  generatedHintLevel3?: string | null;
  generatedHintPromptVersion?: string | null;
};

type MockHintUsage = {
  userId: string;
  problemId: string;
  practiceRunId?: string | null;
  hintLevel: number;
  hintText: string;
  promptVersion: string;
};

type MockAttempt = {
  userId: string;
  problemId: string;
  practiceRunId?: string | null;
  submittedAnswer: string;
  normalizedAnswer: string | null;
  isCorrect: boolean;
  explanationText: string | null;
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
  const problems: MockProblem[] = [
    { id: "problem_1", problemSetId: "set_1", answer: "42", answerFormat: "INTEGER", choices: null, statement: null },
    { id: "problem_mc", problemSetId: "set_1", answer: "B", answerFormat: "MULTIPLE_CHOICE", choices: ["3", "4", "5", "6"], statement: null },
    { id: "problem_expr", problemSetId: "set_1", answer: "2a+6", answerFormat: "EXPRESSION", choices: null, statement: null },
    {
      id: "problem_curated",
      problemSetId: "set_1",
      answer: "B",
      answerFormat: "MULTIPLE_CHOICE",
      choices: ["3", "4", "5", "6"],
      statement: "If 2x + 3 = 11, what is x?",
      curatedHintLevel1: "Undo the +3 before solving for x.",
      curatedHintLevel2: "Subtract 3 from both sides so the equation becomes 2x = 8.",
      curatedHintLevel3: "Now divide both sides by 2 and choose the matching option."
    },
    {
      id: "problem_mixed_curated",
      problemSetId: "set_1",
      answer: "42",
      answerFormat: "INTEGER",
      choices: null,
      statement: "What is 40 + 2?",
      curatedHintLevel1: "Break the problem into tens and ones first.",
      curatedHintLevel2: "Start from 40, then add the remaining 2.",
      curatedHintLevel3: "   "
    },
    {
      id: "problem_geometry_curated",
      problemSetId: "set_1",
      answer: "E",
      answerFormat: "MULTIPLE_CHOICE",
      choices: ["9", "28/3", "10", "31/3", "32/3"],
      statement: "Geometry-style reflected-triangle problem.",
      curatedHintLevel1: "Point E lies on segment BC, so first compare the two triangles across line x = 8.",
      curatedHintLevel2: "Use segment AB as a reference side and track how point E moves under the reflection.",
      curatedHintLevel3: "Now combine the overlapping pieces instead of adding both full triangle areas."
    },
    {
      id: "problem_precomputed",
      problemSetId: "set_1",
      answer: "42",
      answerFormat: "INTEGER",
      choices: null,
      statement: "What is 40 + 2?",
      diagramImageAlt: "A simple number line from 40 to 42.",
      generatedHintLevel1: "Start from the known base value, then add the remaining units.",
      generatedHintLevel2: "Begin at 40 and move forward by 2.",
      generatedHintLevel3: "Compute 40 + 2 directly.",
      generatedHintPromptVersion: "hint-tutor-v1"
    }
  ];
  const hintUsages: MockHintUsage[] = [];
  const attempts: MockAttempt[] = [];

  return {
    problems,
    hintUsages,
    attempts,
    prisma: {
      problem: {
        async findUnique(args: {
          where: { id: string };
          select?: {
            id?: true;
            problemSetId?: true;
            answer?: true;
            answerFormat?: true;
            choices?: true;
            statement?: true;
            diagramImageAlt?: true;
            solutionSketch?: true;
            curatedHintLevel1?: true;
            curatedHintLevel2?: true;
            curatedHintLevel3?: true;
            generatedHintLevel1?: true;
            generatedHintLevel2?: true;
            generatedHintLevel3?: true;
            generatedHintPromptVersion?: true;
          };
        }) {
          const found = problems.find((problem) => problem.id === args.where.id);
          if (!found) {
            return null;
          }

          return {
            ...(args.select?.id ? { id: found.id } : {}),
            ...(args.select?.problemSetId ? { problemSetId: found.problemSetId } : {}),
            ...(args.select?.answer ? { answer: found.answer } : {}),
            ...(args.select?.answerFormat ? { answerFormat: found.answerFormat } : {}),
            ...(args.select?.choices ? { choices: found.choices ?? null } : {}),
            ...(args.select?.statement ? { statement: found.statement ?? null } : {}),
            ...(args.select?.diagramImageAlt ? { diagramImageAlt: found.diagramImageAlt ?? null } : {}),
            ...(args.select?.solutionSketch ? { solutionSketch: found.solutionSketch ?? null } : {}),
            ...(args.select?.curatedHintLevel1 ? { curatedHintLevel1: found.curatedHintLevel1 ?? null } : {}),
            ...(args.select?.curatedHintLevel2 ? { curatedHintLevel2: found.curatedHintLevel2 ?? null } : {}),
            ...(args.select?.curatedHintLevel3 ? { curatedHintLevel3: found.curatedHintLevel3 ?? null } : {}),
            ...(args.select?.generatedHintLevel1 ? { generatedHintLevel1: found.generatedHintLevel1 ?? null } : {}),
            ...(args.select?.generatedHintLevel2 ? { generatedHintLevel2: found.generatedHintLevel2 ?? null } : {}),
            ...(args.select?.generatedHintLevel3 ? { generatedHintLevel3: found.generatedHintLevel3 ?? null } : {}),
            ...(args.select?.generatedHintPromptVersion
              ? { generatedHintPromptVersion: found.generatedHintPromptVersion ?? null }
              : {})
          };
        }
      },
      practiceRun: {
        async findFirst(args: {
          where: {
            id: string;
            userId: string;
            problemSetId: string;
          };
          select: {
            id: true;
          };
        }) {
          if (args.where.id === "run_1" && args.where.userId === "student_1" && args.where.problemSetId === "set_1") {
            return { id: "run_1" };
          }

          return null;
        }
      },
      problemHintUsage: {
        async findMany(args: { where: { userId: string; problemId: string }; select: { hintLevel: true } }) {
          return hintUsages
            .filter((row) => row.userId === args.where.userId && row.problemId === args.where.problemId)
            .map((row) => ({ hintLevel: row.hintLevel }));
        },
        async create(args: { data: MockHintUsage }) {
          hintUsages.push(args.data);
          return args.data;
        }
      },
      problemAttempt: {
        async create(args: { data: MockAttempt }) {
          attempts.push(args.data);
          return args.data;
        }
      }
    }
  };
}

describe("hintTutor router", () => {
  it("progresses hints from level 1 to 2 to 3", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession(),
      prisma: mock.prisma as never
    });

    const first = await caller.hintTutor.getNextHint({ problemId: "problem_1" });
    const second = await caller.hintTutor.getNextHint({ problemId: "problem_1" });
    const third = await caller.hintTutor.getNextHint({ problemId: "problem_1" });

    expect(first.hintLevel).toBe(1);
    expect(first.hintText).toBe("Think about the key concept.");
    expect(first.exhausted).toBe(false);
    expect(second.hintLevel).toBe(2);
    expect(second.hintText).toBe("Try setting up the equation.");
    expect(second.exhausted).toBe(false);
    expect(third.hintLevel).toBe(3);
    expect(third.hintText).toBe("Focus on the key transformation.");
    expect(third.exhausted).toBe(true);
  });

  it("does not exceed hint level 3", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession(),
      prisma: mock.prisma as never
    });

    await caller.hintTutor.getNextHint({ problemId: "problem_1" });
    await caller.hintTutor.getNextHint({ problemId: "problem_1" });
    await caller.hintTutor.getNextHint({ problemId: "problem_1" });
    const fourth = await caller.hintTutor.getNextHint({ problemId: "problem_1" });

    expect(fourth.hintLevel).toBe(3);
    expect(fourth.exhausted).toBe(true);
    expect(mock.hintUsages.at(-1)?.hintLevel).toBe(3);
  });

  it("uses curated hints when available", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession(),
      prisma: mock.prisma as never
    });

    const first = await caller.hintTutor.getNextHint({ problemId: "problem_curated" });
    const second = await caller.hintTutor.getNextHint({ problemId: "problem_curated" });
    const third = await caller.hintTutor.getNextHint({ problemId: "problem_curated" });

    expect(first.hintText).toBe("Undo the +3 before solving for x.");
    expect(second.hintText).toBe("Subtract 3 from both sides so the equation becomes 2x = 8.");
    expect(third.hintText).toBe("Now divide both sides by 2 and choose the matching option.");
    expect(mock.hintUsages.map((usage) => usage.promptVersion).slice(-3)).toEqual([
      "curated-hint-v1",
      "curated-hint-v1",
      "curated-hint-v1"
    ]);
  });

  it("mixes curated and standard hint paths when later curated levels are missing", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession(),
      prisma: mock.prisma as never
    });

    const first = await caller.hintTutor.getNextHint({ problemId: "problem_mixed_curated" });
    const second = await caller.hintTutor.getNextHint({ problemId: "problem_mixed_curated" });
    const third = await caller.hintTutor.getNextHint({ problemId: "problem_mixed_curated" });

    expect(first.hintLevel).toBe(1);
    expect(first.hintText).toBe("Break the problem into tens and ones first.");
    expect(second.hintLevel).toBe(2);
    expect(second.hintText).toBe("Start from 40, then add the remaining 2.");
    expect(third.hintLevel).toBe(3);
    expect(third.hintText).toBe("Focus on the key transformation.");
    expect(third.exhausted).toBe(true);
    expect(mock.hintUsages.slice(-3).map((usage) => usage.promptVersion)).toEqual([
      "curated-hint-v1",
      "curated-hint-v1",
      "hint-tutor-v1"
    ]);
  });

  it("keeps curated geometry hints with point-label references instead of suppressing them as leaks", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession(),
      prisma: mock.prisma as never
    });

    const first = await caller.hintTutor.getNextHint({ problemId: "problem_geometry_curated" });

    expect(first.hintLevel).toBe(1);
    expect(first.hintText).toBe("Point E lies on segment BC, so first compare the two triangles across line x = 8.");
    expect(mock.hintUsages.at(-1)?.promptVersion).toBe("curated-hint-v1");
  });

  it("uses precomputed hints before falling back to live generation", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession(),
      prisma: mock.prisma as never
    });

    const first = await caller.hintTutor.getNextHint({ problemId: "problem_precomputed" });
    const second = await caller.hintTutor.getNextHint({ problemId: "problem_precomputed" });
    const third = await caller.hintTutor.getNextHint({ problemId: "problem_precomputed" });

    expect(first.hintText).toBe("Start from the known base value, then add the remaining units.");
    expect(second.hintText).toBe("Begin at 40 and move forward by 2.");
    expect(third.hintText).toBe("Compute 40 + 2 directly.");
    expect(mock.hintUsages.slice(-3).map((usage) => usage.promptVersion)).toEqual([
      "precomputed-hint-v1:hint-tutor-v1",
      "precomputed-hint-v1:hint-tutor-v1",
      "precomputed-hint-v1:hint-tutor-v1"
    ]);
  });

  it("submitAttempt persists ProblemAttempt", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession(),
      prisma: mock.prisma as never
    });

    const result = await caller.hintTutor.submitAttempt({
      problemId: "problem_1",
      submittedAnswer: " 41 "
    });

    expect(result.isCorrect).toBe(false);
    expect(result.explanation).toContain("does not match");
    expect(result.correctAnswer).toBe("42");
    expect(mock.attempts).toHaveLength(1);
    expect(mock.attempts[0]).toMatchObject({
      userId: "student_1",
      problemId: "problem_1",
      submittedAnswer: " 41 ",
      normalizedAnswer: "41",
      isCorrect: false
    });
  });

  it("grades multiple choice answers by label or choice text", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession(),
      prisma: mock.prisma as never
    });

    const byText = await caller.hintTutor.submitAttempt({
      problemId: "problem_mc",
      submittedAnswer: "4"
    });
    const byLabel = await caller.hintTutor.submitAttempt({
      problemId: "problem_mc",
      submittedAnswer: "b"
    });

    expect(byText.isCorrect).toBe(true);
    expect(byLabel.isCorrect).toBe(true);
    expect(mock.attempts[0]?.normalizedAnswer).toBe("B");
    expect(mock.attempts[1]?.normalizedAnswer).toBe("B");
  });

  it("grades integer answers with stronger normalization", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession(),
      prisma: mock.prisma as never
    });

    const result = await caller.hintTutor.submitAttempt({
      problemId: "problem_1",
      submittedAnswer: " 0042 "
    });

    expect(result.isCorrect).toBe(true);
    expect(mock.attempts[0]?.normalizedAnswer).toBe("42");
  });

  it("grades expression answers conservatively", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: makeSession(),
      prisma: mock.prisma as never
    });

    const equivalentFormatting = await caller.hintTutor.submitAttempt({
      problemId: "problem_expr",
      submittedAnswer: " ( 2A + 6 ) "
    });
    const symbolicMismatch = await caller.hintTutor.submitAttempt({
      problemId: "problem_expr",
      submittedAnswer: "a+a+6"
    });

    expect(equivalentFormatting.isCorrect).toBe(true);
    expect(symbolicMismatch.isCorrect).toBe(false);
  });

  it("rejects unauthenticated access", async () => {
    const mock = createPrismaMock();
    const caller = appRouter.createCaller({
      session: null,
      prisma: mock.prisma as never
    });

    await expect(caller.hintTutor.getNextHint({ problemId: "problem_1" })).rejects.toBeInstanceOf(TRPCError);
    await expect(
      caller.hintTutor.submitAttempt({ problemId: "problem_1", submittedAnswer: "42" })
    ).rejects.toBeInstanceOf(TRPCError);
  });
});
