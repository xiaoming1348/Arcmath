import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { appRouter } from "@/lib/trpc/router";

type MockProblemSet = {
  id: string;
  contest: "AMC8" | "AMC10" | "AMC12" | "AIME";
  year: number;
  exam: string | null;
  title: string;
  sourceUrl: string | null;
  verifiedPdfUrl?: string | null;
};

type MockProblem = {
  id: string;
  problemSetId: string;
  number: number;
  statement: string | null;
  diagramImageUrl: string | null;
  diagramImageAlt: string | null;
  choicesImageUrl: string | null;
  choicesImageAlt: string | null;
  statementFormat: "MARKDOWN_LATEX" | "HTML" | "PLAIN";
  choices: unknown;
  answer: string | null;
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";
  examTrack: string | null;
  sourceLabel: string | null;
  topicKey: string | null;
  techniqueTags: string[];
  diagnosticEligible: boolean;
  difficultyBand: string | null;
  solutionSketch: string | null;
  curatedHintLevel1: string | null;
  curatedHintLevel2: string | null;
  curatedHintLevel3: string | null;
  sourceUrl: string | null;
};

function makeAdminSession(): Session {
  return {
    user: {
      id: "admin_1",
      email: "admin@arcmath.local",
      role: "ADMIN"
    },
    expires: new Date(Date.now() + 60_000).toISOString()
  };
}

function makeStudentSession(): Session {
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
  let problemSetCounter = 1;
  let problemCounter = 1;
  let importJobCounter = 1;

  const problemSets: MockProblemSet[] = [];
  const problems: MockProblem[] = [];
  const importJobs: Array<{ id: string; status: string; report: unknown }> = [];

  const tx = {
    problemSet: {
      async findFirst(args: { where: { contest: string; year: number; exam: string | null } }) {
        const { contest, year, exam } = args.where;
        return (
          problemSets.find(
            (set) => set.contest === contest && set.year === year && (set.exam ?? null) === (exam ?? null)
          ) ?? null
        );
      },
      async create(args: { data: { contest: MockProblemSet["contest"]; year: number; exam: string | null; title: string; sourceUrl?: string; verifiedPdfUrl?: string } }) {
        const created: MockProblemSet = {
          id: `ps_${problemSetCounter++}`,
          contest: args.data.contest,
          year: args.data.year,
          exam: args.data.exam,
          title: args.data.title,
          sourceUrl: args.data.sourceUrl ?? null,
          verifiedPdfUrl: args.data.verifiedPdfUrl ?? null
        };
        problemSets.push(created);
        return created;
      },
      async update(args: { where: { id: string }; data: Partial<MockProblemSet> }) {
        const found = problemSets.find((set) => set.id === args.where.id);
        if (!found) {
          throw new Error("ProblemSet not found");
        }
        Object.assign(found, args.data);
        return found;
      }
    },
    problem: {
      async findMany(args: { where: { problemSetId: string }; select?: { number: true } }) {
        const rows = problems
          .filter((problem) => problem.problemSetId === args.where.problemSetId)
          .sort((a, b) => a.number - b.number);
        if (args.select?.number) {
          return rows.map((row) => ({ number: row.number }));
        }
        return rows;
      },
      async findUnique(args: { where: { problemSetId_number: { problemSetId: string; number: number } } }) {
        const key = args.where.problemSetId_number;
        return (
          problems.find((problem) => problem.problemSetId === key.problemSetId && problem.number === key.number) ??
          null
        );
      },
      async create(args: {
        data: {
          problemSet: { connect: { id: string } };
          number: number;
          statement?: string;
          diagramImageUrl?: string | null;
          diagramImageAlt?: string | null;
          choicesImageUrl?: string | null;
          choicesImageAlt?: string | null;
          statementFormat: MockProblem["statementFormat"];
          choices?: unknown;
          answer?: string;
          answerFormat: MockProblem["answerFormat"];
          examTrack?: string | null;
          sourceLabel?: string | null;
          topicKey?: string | null;
          techniqueTags?: string[];
          diagnosticEligible?: boolean;
          difficultyBand?: string | null;
          solutionSketch?: string | null;
          curatedHintLevel1?: string | null;
          curatedHintLevel2?: string | null;
          curatedHintLevel3?: string | null;
          sourceUrl?: string | null;
        };
      }) {
        // Mirror what a fresh Prisma `problem.create` would return: string
        // columns unset by the caller materialize as `null`, the scalar
        // array defaults to `[]`, and the boolean defaults to `false`.
        // Without this, `buildProblemUpdateData` on a second commit would
        // see `undefined !== null` and falsely report every problem as
        // updated on idempotent re-imports.
        const created: MockProblem = {
          id: `p_${problemCounter++}`,
          problemSetId: args.data.problemSet.connect.id,
          number: args.data.number,
          statement: args.data.statement ?? null,
          diagramImageUrl: args.data.diagramImageUrl ?? null,
          diagramImageAlt: args.data.diagramImageAlt ?? null,
          choicesImageUrl: args.data.choicesImageUrl ?? null,
          choicesImageAlt: args.data.choicesImageAlt ?? null,
          statementFormat: args.data.statementFormat,
          choices: args.data.choices ?? null,
          answer: args.data.answer ?? null,
          answerFormat: args.data.answerFormat,
          examTrack: args.data.examTrack ?? null,
          sourceLabel: args.data.sourceLabel ?? null,
          topicKey: args.data.topicKey ?? null,
          techniqueTags: args.data.techniqueTags ?? [],
          diagnosticEligible: args.data.diagnosticEligible ?? false,
          difficultyBand: args.data.difficultyBand ?? null,
          solutionSketch: args.data.solutionSketch ?? null,
          curatedHintLevel1: args.data.curatedHintLevel1 ?? null,
          curatedHintLevel2: args.data.curatedHintLevel2 ?? null,
          curatedHintLevel3: args.data.curatedHintLevel3 ?? null,
          sourceUrl: args.data.sourceUrl ?? null
        };
        problems.push(created);
        return created;
      },
      async update(args: { where: { id: string }; data: Partial<MockProblem> }) {
        const found = problems.find((problem) => problem.id === args.where.id);
        if (!found) {
          throw new Error("Problem not found");
        }
        Object.assign(found, args.data);
        return found;
      }
    }
  };

  return {
    problemSets,
    problems,
    importJobs,
    prisma: {
      ...tx,
      importJob: {
        async create(args: { data: { status: string } }) {
          const job = {
            id: `job_${importJobCounter++}`,
            status: args.data.status,
            report: null
          };
          importJobs.push(job);
          return job;
        },
        async update(args: { where: { id: string }; data: { status?: string; report?: unknown } }) {
          const job = importJobs.find((item) => item.id === args.where.id);
          if (!job) {
            throw new Error("ImportJob not found");
          }
          if (args.data.status) {
            job.status = args.data.status;
          }
          if (args.data.report !== undefined) {
            job.report = args.data.report;
          }
          return job;
        }
      },
      async $transaction<T>(cb: (transactionClient: typeof tx) => Promise<T>) {
        return cb(tx);
      }
    }
  };
}

type CanonicalProblem = {
  number: number;
  statement: string;
  statementFormat: "MARKDOWN_LATEX";
  choices: string[];
  answer: string;
  answerFormat: "MULTIPLE_CHOICE";
  diagramImageUrl?: string;
  diagramImageAlt?: string;
  choicesImageUrl?: string;
  choicesImageAlt?: string;
  sourceLabel?: string;
  topicKey?: string;
  techniqueTags?: string[];
  diagnosticEligible?: boolean;
  difficultyBand?: string;
  solutionSketch?: string;
  curatedHintLevel1?: string;
  curatedHintLevel2?: string;
  curatedHintLevel3?: string;
  sourceUrl?: string;
};

function makeCanonicalProblem(number: number): CanonicalProblem {
  return {
    number,
    statement: `What is problem ${number}?`,
    statementFormat: "MARKDOWN_LATEX",
    choices: ["1", "2", "3", "4", "5"],
    answer: "B",
    answerFormat: "MULTIPLE_CHOICE"
  };
}

function makeCanonicalPayload() {
  return {
    problemSet: {
      contest: "AMC10" as const,
      year: 2022,
      exam: "A",
      sourceUrl: "https://example.com/amc10a-2022",
      verifiedPdfUrl: "https://example.com/amc10a-2022.pdf"
    },
    problems: Array.from({ length: 25 }, (_, index) => makeCanonicalProblem(index + 1))
  };
}

const sampleImportJson = JSON.stringify(makeCanonicalPayload());

describe("admin import router", () => {
  it("blocks non-admin users", async () => {
    const { prisma } = createPrismaMock();
    const caller = appRouter.createCaller({
      prisma: prisma as never,
      session: makeStudentSession()
    });

    await expect(caller.admin.import.preview({ jsonText: sampleImportJson })).rejects.toBeInstanceOf(TRPCError);
  });

  it("previews and commits idempotently", async () => {
    const { prisma, problemSets, problems } = createPrismaMock();
    const caller = appRouter.createCaller({
      prisma: prisma as never,
      session: makeAdminSession()
    });

    const preview = await caller.admin.import.preview({ jsonText: sampleImportJson, filename: "sample.json" });
    expect(preview.isValid).toBe(true);
    expect(preview.problemCount).toBe(25);
    expect(preview.existingSet).toBe(false);

    const firstCommit = await caller.admin.import.commit({ jsonText: sampleImportJson, filename: "sample.json" });
    expect(firstCommit.createdProblems).toBe(25);
    expect(firstCommit.updatedProblems).toBe(0);
    expect(firstCommit.skippedProblems).toBe(0);
    expect(problemSets).toHaveLength(1);
    expect(problems).toHaveLength(25);

    const secondCommit = await caller.admin.import.commit({ jsonText: sampleImportJson, filename: "sample.json" });
    expect(secondCommit.createdProblems).toBe(0);
    expect(secondCommit.updatedProblems).toBe(0);
    expect(secondCommit.skippedProblems).toBe(25);
    expect(problemSets).toHaveLength(1);
    expect(problems).toHaveLength(25);
  });

  it("persists tutor metadata on create and update", async () => {
    const { prisma, problems } = createPrismaMock();
    const caller = appRouter.createCaller({
      prisma: prisma as never,
      session: makeAdminSession()
    });

    const initialPayload = makeCanonicalPayload();
    initialPayload.problems[0] = {
      ...initialPayload.problems[0],
      diagramImageUrl: "https://example.com/problem-1-diagram.png",
      diagramImageAlt: "A sample diagram for problem 1.",
      topicKey: "algebra.linear_equations",
      difficultyBand: "EASY",
      solutionSketch: "Subtract first, then divide.",
      curatedHintLevel1: "Undo the addition.",
      curatedHintLevel2: "Isolate the variable term.",
      curatedHintLevel3: "Now solve the one-step equation."
    };

    await caller.admin.import.commit({
      jsonText: JSON.stringify(initialPayload),
      filename: "sample.json"
    });

    expect(problems[0]).toMatchObject({
      diagramImageUrl: "https://example.com/problem-1-diagram.png",
      diagramImageAlt: "A sample diagram for problem 1.",
      topicKey: "algebra.linear_equations",
      difficultyBand: "EASY",
      solutionSketch: "Subtract first, then divide.",
      curatedHintLevel1: "Undo the addition.",
      curatedHintLevel2: "Isolate the variable term.",
      curatedHintLevel3: "Now solve the one-step equation."
    });

    const updatedPayload = makeCanonicalPayload();
    updatedPayload.problems[0] = {
      ...updatedPayload.problems[0],
      diagramImageUrl: "https://example.com/problem-1-diagram-v2.png",
      diagramImageAlt: "An updated sample diagram for problem 1.",
      topicKey: "algebra.expressions",
      difficultyBand: "MEDIUM",
      solutionSketch: "Distribute before combining terms.",
      curatedHintLevel1: "Look inside the parentheses first.",
      curatedHintLevel2: "Distribute carefully.",
      curatedHintLevel3: "Then combine like terms."
    };

    const updateCommit = await caller.admin.import.commit({
      jsonText: JSON.stringify(updatedPayload),
      filename: "sample-updated.json"
    });

    expect(updateCommit.updatedProblems).toBe(1);
    expect(problems[0]).toMatchObject({
      diagramImageUrl: "https://example.com/problem-1-diagram-v2.png",
      diagramImageAlt: "An updated sample diagram for problem 1.",
      topicKey: "algebra.expressions",
      difficultyBand: "MEDIUM",
      solutionSketch: "Distribute before combining terms.",
      curatedHintLevel1: "Look inside the parentheses first.",
      curatedHintLevel2: "Distribute carefully.",
      curatedHintLevel3: "Then combine like terms."
    });
  });
});
