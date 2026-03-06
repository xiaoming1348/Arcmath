import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { appRouter } from "@/lib/trpc/router";

const cacheAvailability = new Map<string, boolean>();

vi.mock("@/lib/official-pdf-cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/official-pdf-cache")>();
  return {
    ...actual,
    hasCachedOfficialPdf: vi.fn(async (problemSetId: string) => cacheAvailability.get(problemSetId) ?? false)
  };
});

type MockProblem = {
  id: string;
  number: number;
  statement: string | null;
  answer: string | null;
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";
  sourceUrl: string | null;
};

type MockProblemSet = {
  id: string;
  title: string;
  contest: "AMC8" | "AMC10" | "AMC12" | "AIME";
  year: number;
  exam: string | null;
  sourceUrl: string | null;
  verifiedPdfUrl: string | null;
  cachedPdfPath: string | null;
  problems: MockProblem[];
};

type Grant = {
  userId: string;
  problemSetId: string;
};

function makeSession(role: "STUDENT" | "ADMIN"): Session {
  return {
    user: {
      id: `${role.toLowerCase()}_1`,
      email: `${role.toLowerCase()}@example.com`,
      role
    },
    expires: new Date(Date.now() + 60_000).toISOString()
  };
}

function makeProblemSet(input: {
  id: string;
  contest: MockProblemSet["contest"];
  year: number;
  exam: string | null;
}): MockProblemSet {
  return {
    id: input.id,
    title: `${input.contest} ${input.year}${input.exam ? ` ${input.exam}` : ""}`,
    contest: input.contest,
    year: input.year,
    exam: input.exam,
    sourceUrl: `https://example.com/${input.id}`,
    verifiedPdfUrl: null,
    cachedPdfPath: `/tmp/official-pdfs/${input.id}.pdf`,
    problems: [
      {
        id: `${input.id}_p1`,
        number: 1,
        statement: `Problem statement ${input.id}`,
        answer: "A",
        answerFormat: "MULTIPLE_CHOICE",
        sourceUrl: `https://example.com/${input.id}#1`
      }
    ]
  };
}

function matchesWhere(
  set: MockProblemSet,
  where:
    | {
        contest?: string | { in?: string[] };
        year?: number | { gte?: number; lte?: number; equals?: number };
        exam?: string | null;
      }
    | undefined
): boolean {
  if (!where) {
    return true;
  }

  if (where.contest) {
    if (typeof where.contest === "string" && set.contest !== where.contest) {
      return false;
    }
    if (typeof where.contest === "object" && where.contest.in && !where.contest.in.includes(set.contest)) {
      return false;
    }
  }

  if (where.year !== undefined) {
    if (typeof where.year === "number") {
      if (set.year !== where.year) {
        return false;
      }
    } else {
      if (where.year.equals !== undefined && set.year !== where.year.equals) {
        return false;
      }
      if (where.year.gte !== undefined && set.year < where.year.gte) {
        return false;
      }
      if (where.year.lte !== undefined && set.year > where.year.lte) {
        return false;
      }
    }
  }

  if (where.exam !== undefined) {
    if ((set.exam ?? null) !== where.exam) {
      return false;
    }
  }

  return true;
}

function sortSets(sets: MockProblemSet[]): MockProblemSet[] {
  return [...sets].sort((a, b) => {
    if (a.year !== b.year) {
      return b.year - a.year;
    }
    if (a.contest !== b.contest) {
      return a.contest.localeCompare(b.contest);
    }
    if ((a.exam ?? "") !== (b.exam ?? "")) {
      return (a.exam ?? "").localeCompare(b.exam ?? "");
    }
    return a.title.localeCompare(b.title);
  });
}

function createPrismaMock(allSets: MockProblemSet[]) {
  const grants: Grant[] = [];

  const problemSet = {
    findMany: async (args: {
      where?: {
        contest?: string | { in?: string[] };
        year?: number | { gte?: number; lte?: number; equals?: number };
        exam?: string | null;
      };
      skip?: number;
      take?: number;
      select?: {
        id?: true;
        title?: true;
        contest?: true;
        year?: true;
        exam?: true;
        sourceUrl?: true;
        verifiedPdfUrl?: true;
        cachedPdfPath?: true;
        _count?: { select: { problems: true } };
      };
    }) => {
      const filtered = sortSets(allSets).filter((set) => matchesWhere(set, args.where));
      const skip = args.skip ?? 0;
      const take = args.take ?? filtered.length;
      const sliced = filtered.slice(skip, skip + take);

      if (args.select?._count) {
        return sliced.map((set) => ({
          id: set.id,
          title: set.title,
          contest: set.contest,
          year: set.year,
          exam: set.exam,
          sourceUrl: set.sourceUrl,
          verifiedPdfUrl: set.verifiedPdfUrl,
          cachedPdfPath: set.cachedPdfPath,
          _count: { problems: set.problems.length }
        }));
      }

      return sliced;
    },
    findUnique: async (args: {
      where: { id?: string; contest_year_exam?: { contest: string; year: number; exam: string | null } };
      include?: { problems?: { orderBy?: { number: "asc" } } };
    }) => {
      let found: MockProblemSet | undefined;

      if (args.where.id) {
        found = allSets.find((set) => set.id === args.where.id);
      } else if (args.where.contest_year_exam) {
        const key = args.where.contest_year_exam;
        found = allSets.find(
          (set) => set.contest === key.contest && set.year === key.year && (set.exam ?? null) === (key.exam ?? null)
        );
      }

      if (!found) {
        return null;
      }

      return {
        ...found,
        problems:
          args.include?.problems
            ? [...found.problems].sort((a, b) => a.number - b.number)
            : found.problems
      };
    }
  };

  const userResourceAccess = {
    findMany: async (args: { where: { userId: string }; select: { problemSetId: true } }) =>
      grants.filter((grant) => grant.userId === args.where.userId).map((grant) => ({ problemSetId: grant.problemSetId })),
    count: async (args: { where: { userId: string } }) =>
      grants.filter((grant) => grant.userId === args.where.userId).length,
    findUnique: async (args: { where: { userId_problemSetId: { userId: string; problemSetId: string } } }) =>
      grants.find(
        (grant) =>
          grant.userId === args.where.userId_problemSetId.userId &&
          grant.problemSetId === args.where.userId_problemSetId.problemSetId
      ) ?? null,
    create: async (args: { data: { userId: string; problemSetId: string } }) => {
      const record = {
        userId: args.data.userId,
        problemSetId: args.data.problemSetId
      };
      grants.push(record);
      return record;
    }
  };

  const tx = {
    userResourceAccess
  };

  return {
    grants,
    prisma: {
      problemSet,
      userResourceAccess,
      $transaction: async <T>(cb: (trx: typeof tx) => Promise<T>) => cb(tx)
    }
  };
}

describe("resources router scoped downloadable behavior", () => {
  beforeEach(() => {
    cacheAvailability.clear();
  });

  it("only exposes last 10 complete years and valid exam options", async () => {
    const currentYear = new Date().getFullYear();
    const yearTo = currentYear - 1;
    const yearFrom = yearTo - 9;

    const inScope = makeProblemSet({ id: "set_in_scope", contest: "AMC12", year: yearTo, exam: "A" });
    const outOfScopeOld = makeProblemSet({ id: "set_old", contest: "AMC12", year: yearFrom - 1, exam: "A" });
    const invalidExam = makeProblemSet({ id: "set_invalid_exam", contest: "AMC10", year: yearTo, exam: "II" });

    const mock = createPrismaMock([inScope, outOfScopeOld, invalidExam]);

    cacheAvailability.set("set_in_scope", true);
    cacheAvailability.set("set_in_scope.answers", true);
    cacheAvailability.set("set_old", true);
    cacheAvailability.set("set_old.answers", true);
    cacheAvailability.set("set_invalid_exam", true);
    cacheAvailability.set("set_invalid_exam.answers", true);

    const caller = appRouter.createCaller({
      session: makeSession("STUDENT"),
      prisma: mock.prisma as never
    });

    const filters = await caller.resourceSets.listDistinctFilters();

    expect(filters.yearWindow).toEqual({ yearFrom, yearTo });
    expect(filters.years).toEqual([yearTo]);
    expect(filters.contests).toEqual(["AMC12"]);
    expect(filters.examOptionsByContest.AMC10).toEqual([]);
    expect(filters.examOptionsByContest.AMC12).toEqual(["A"]);
    expect(filters.examOptionsByContest.AIME).toEqual([]);
    expect(filters.examOptionsByContest.AMC8).toEqual([]);
  });

  it("hides sets that are missing one variant cache artifact", async () => {
    const currentYear = new Date().getFullYear();
    const yearTo = currentYear - 1;

    const completeSet = makeProblemSet({ id: "set_complete", contest: "AMC10", year: yearTo, exam: "A" });
    const missingAnswers = makeProblemSet({ id: "set_missing_answers", contest: "AMC10", year: yearTo, exam: "B" });

    const mock = createPrismaMock([completeSet, missingAnswers]);
    cacheAvailability.set("set_complete", true);
    cacheAvailability.set("set_complete.answers", true);
    cacheAvailability.set("set_missing_answers", true);
    cacheAvailability.set("set_missing_answers.answers", false);

    const caller = appRouter.createCaller({
      session: makeSession("STUDENT"),
      prisma: mock.prisma as never
    });

    const list = await caller.resources.list({ page: 1, pageSize: 10, contest: "AMC10", year: yearTo });

    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id).toBe("set_complete");
  });

  it("searching files does not consume free download slots", async () => {
    const currentYear = new Date().getFullYear();
    const yearTo = currentYear - 1;

    const allSets = [
      makeProblemSet({ id: "set_1", contest: "AMC10", year: yearTo, exam: "A" }),
      makeProblemSet({ id: "set_2", contest: "AMC10", year: yearTo, exam: "B" }),
      makeProblemSet({ id: "set_3", contest: "AMC12", year: yearTo, exam: "A" }),
      makeProblemSet({ id: "set_4", contest: "AIME", year: yearTo, exam: "I" })
    ];
    const mock = createPrismaMock(allSets);

    for (const set of allSets) {
      cacheAvailability.set(set.id, true);
      cacheAvailability.set(`${set.id}.answers`, true);
    }

    const caller = appRouter.createCaller({
      session: makeSession("STUDENT"),
      prisma: mock.prisma as never
    });

    const firstSearch = await caller.resources.byKey({ contest: "AMC10", year: yearTo, exam: "A" });
    const secondSearch = await caller.resources.byKey({ contest: "AMC10", year: yearTo, exam: "B" });
    const thirdSearch = await caller.resources.byKey({ contest: "AMC12", year: yearTo, exam: "A" });
    const fourthSearch = await caller.resources.byKey({ contest: "AIME", year: yearTo, exam: "I" });

    expect(firstSearch.status).toBe("ok");
    expect(secondSearch.status).toBe("ok");
    expect(thirdSearch.status).toBe("ok");
    expect(fourthSearch.status).toBe("ok");
    expect(mock.grants).toHaveLength(0);
  });

  it("marks ungranted files as locked in list after quota is used", async () => {
    const currentYear = new Date().getFullYear();
    const yearTo = currentYear - 1;

    const allSets = [
      makeProblemSet({ id: "set_1", contest: "AMC10", year: yearTo, exam: "A" }),
      makeProblemSet({ id: "set_2", contest: "AMC10", year: yearTo, exam: "B" }),
      makeProblemSet({ id: "set_3", contest: "AMC12", year: yearTo, exam: "A" }),
      makeProblemSet({ id: "set_4", contest: "AIME", year: yearTo, exam: "I" })
    ];

    const mock = createPrismaMock(allSets);
    for (const set of allSets) {
      cacheAvailability.set(set.id, true);
      cacheAvailability.set(`${set.id}.answers`, true);
    }

    const caller = appRouter.createCaller({
      session: makeSession("STUDENT"),
      prisma: mock.prisma as never
    });

    mock.grants.push(
      { userId: "student_1", problemSetId: "set_1" },
      { userId: "student_1", problemSetId: "set_2" },
      { userId: "student_1", problemSetId: "set_4" }
    );

    const list = await caller.resources.list({ page: 1, pageSize: 10 });
    const rowSet3 = list.items.find((row) => row.id === "set_3");

    expect(list.items).toHaveLength(4);
    expect(rowSet3?.isLocked).toBe(true);
  });
});
