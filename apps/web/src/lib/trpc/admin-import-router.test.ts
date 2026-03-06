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
};

type MockProblem = {
  id: string;
  problemSetId: string;
  number: number;
  statement: string | null;
  statementFormat: "MARKDOWN_LATEX" | "HTML" | "PLAIN";
  choices: unknown;
  answer: string | null;
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";
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
      async create(args: { data: { contest: MockProblemSet["contest"]; year: number; exam: string | null; title: string; sourceUrl?: string } }) {
        const created: MockProblemSet = {
          id: `ps_${problemSetCounter++}`,
          contest: args.data.contest,
          year: args.data.year,
          exam: args.data.exam,
          title: args.data.title,
          sourceUrl: args.data.sourceUrl ?? null
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
      async create(args: { data: { problemSet: { connect: { id: string } }; number: number; statement?: string; statementFormat: MockProblem["statementFormat"]; choices?: unknown; answer?: string; answerFormat: MockProblem["answerFormat"]; sourceUrl?: string } }) {
        const created: MockProblem = {
          id: `p_${problemCounter++}`,
          problemSetId: args.data.problemSet.connect.id,
          number: args.data.number,
          statement: args.data.statement ?? null,
          statementFormat: args.data.statementFormat,
          choices: args.data.choices ?? null,
          answer: args.data.answer ?? null,
          answerFormat: args.data.answerFormat,
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

const sampleImportJson = JSON.stringify({
  problemSet: {
    contest: "AMC10",
    year: 2022,
    exam: "A",
    sourceUrl: "https://example.com/amc10a-2022"
  },
  problems: [
    {
      number: 1,
      statement: "What is 1+1?",
      answer: "B"
    },
    {
      number: 2,
      statement: "What is 2+2?",
      answer: "D"
    }
  ]
});

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
    expect(preview.problemCount).toBe(2);
    expect(preview.existingSet).toBe(false);

    const firstCommit = await caller.admin.import.commit({ jsonText: sampleImportJson, filename: "sample.json" });
    expect(firstCommit.createdProblems).toBe(2);
    expect(firstCommit.updatedProblems).toBe(0);
    expect(firstCommit.skippedProblems).toBe(0);
    expect(problemSets).toHaveLength(1);
    expect(problems).toHaveLength(2);

    const secondCommit = await caller.admin.import.commit({ jsonText: sampleImportJson, filename: "sample.json" });
    expect(secondCommit.createdProblems).toBe(0);
    expect(secondCommit.updatedProblems).toBe(0);
    expect(secondCommit.skippedProblems).toBe(2);
    expect(problemSets).toHaveLength(1);
    expect(problems).toHaveLength(2);
  });
});
