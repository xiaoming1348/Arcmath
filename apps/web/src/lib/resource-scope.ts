import type { Contest, PrismaClient } from "@arcmath/db";
import { hasCachedOfficialPdf } from "./official-pdf-cache";
import { getProblemSetPdfCacheKey } from "./problem-set-pdf-generation";

export const RESOURCE_SCOPE_CONTESTS: Contest[] = ["AMC8", "AMC10", "AMC12", "AIME"];

export type ResourceYearWindow = {
  yearFrom: number;
  yearTo: number;
};

export type ResourceScopeRow = {
  id: string;
  title: string;
  contest: Contest;
  year: number;
  exam: string | null;
  sourceUrl: string | null;
  verifiedPdfUrl: string | null;
  cachedPdfPath?: string | null;
  problemCount?: number;
};

type ScopeFilters = {
  contest?: Contest;
  year?: number;
  exam?: string | null;
};

type ScopePrisma = Pick<PrismaClient, "problemSet">;

export function getLastCompleteYearsWindow(now: Date = new Date()): ResourceYearWindow {
  const currentYear = now.getFullYear();
  const yearTo = currentYear - 1;
  const yearFrom = yearTo - 9;
  return {
    yearFrom,
    yearTo
  };
}

export function getAllowedExamsForContest(contest: Contest): string[] {
  if (contest === "AMC8") {
    return [];
  }
  if (contest === "AMC10" || contest === "AMC12") {
    return ["A", "B"];
  }
  return ["I", "II"];
}

export function normalizeExamInput(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function isValidContestExamPair(contest: Contest, exam: string | null): boolean {
  if (contest === "AMC8") {
    return exam === null;
  }

  const normalized = normalizeExamInput(exam);
  if (!normalized) {
    return false;
  }

  return getAllowedExamsForContest(contest).includes(normalized);
}

export function createExamOptionsByContest(rows: ResourceScopeRow[]): Record<Contest, string[]> {
  const entries: Record<Contest, Set<string>> = {
    AMC8: new Set<string>(),
    AMC10: new Set<string>(),
    AMC12: new Set<string>(),
    AIME: new Set<string>()
  };

  for (const row of rows) {
    const exam = normalizeExamInput(row.exam);
    if (!exam) {
      continue;
    }
    if (isValidContestExamPair(row.contest, exam)) {
      entries[row.contest].add(exam);
    }
  }

  return {
    AMC8: [],
    AMC10: [...entries.AMC10].sort(),
    AMC12: [...entries.AMC12].sort(),
    AIME: [...entries.AIME].sort()
  };
}

export function createYearsByContest(rows: ResourceScopeRow[]): Record<Contest, number[]> {
  const entries: Record<Contest, Set<number>> = {
    AMC8: new Set<number>(),
    AMC10: new Set<number>(),
    AMC12: new Set<number>(),
    AIME: new Set<number>()
  };

  for (const row of rows) {
    entries[row.contest].add(row.year);
  }

  return {
    AMC8: [...entries.AMC8].sort((a, b) => b - a),
    AMC10: [...entries.AMC10].sort((a, b) => b - a),
    AMC12: [...entries.AMC12].sort((a, b) => b - a),
    AIME: [...entries.AIME].sort((a, b) => b - a)
  };
}

function sortRows(rows: ResourceScopeRow[]): ResourceScopeRow[] {
  return [...rows].sort((left, right) => {
    if (left.year !== right.year) {
      return right.year - left.year;
    }
    if (left.contest !== right.contest) {
      return left.contest.localeCompare(right.contest);
    }
    if ((left.exam ?? "") !== (right.exam ?? "")) {
      return (left.exam ?? "").localeCompare(right.exam ?? "");
    }
    return left.title.localeCompare(right.title);
  });
}

function toScopeWhere(filters: ScopeFilters | undefined, window: ResourceYearWindow) {
  const exam = normalizeExamInput(filters?.exam);

  return {
    contest: {
      in: filters?.contest ? [filters.contest] : RESOURCE_SCOPE_CONTESTS
    },
    year: {
      gte: window.yearFrom,
      lte: window.yearTo,
      ...(filters?.year !== undefined ? { equals: filters.year } : {})
    },
    ...(filters?.contest === "AMC8" ? { exam: null } : exam ? { exam } : {})
  } as const;
}

export async function listScopedDownloadableProblemSets(input: {
  prisma: ScopePrisma;
  filters?: ScopeFilters;
  now?: Date;
}): Promise<ResourceScopeRow[]> {
  const window = getLastCompleteYearsWindow(input.now);
  const where = toScopeWhere(input.filters, window);

  const rows = (await input.prisma.problemSet.findMany({
    where,
    select: {
      id: true,
      title: true,
      contest: true,
      year: true,
      exam: true,
      sourceUrl: true,
      verifiedPdfUrl: true,
      cachedPdfPath: true,
      _count: {
        select: {
          problems: true
        }
      }
    }
  })) as Array<{
    id: string;
    title: string;
    contest: Contest;
    year: number;
    exam: string | null;
    sourceUrl: string | null;
    verifiedPdfUrl: string | null;
    cachedPdfPath: string | null;
    _count: {
      problems: number;
    };
  }>;

  const checks = await Promise.all(
    rows.map(async (row) => {
      const normalizedExam = normalizeExamInput(row.exam);
      if (!isValidContestExamPair(row.contest, normalizedExam)) {
        return null;
      }

      const [hasProblemsPdf, hasAnswersPdf] = await Promise.all([
        hasCachedOfficialPdf(getProblemSetPdfCacheKey(row.id, "problems")),
        hasCachedOfficialPdf(getProblemSetPdfCacheKey(row.id, "answers"))
      ]);

      if (!hasProblemsPdf || !hasAnswersPdf) {
        return null;
      }

      return {
        id: row.id,
        title: row.title,
        contest: row.contest,
        year: row.year,
        exam: normalizedExam,
        sourceUrl: row.sourceUrl,
        verifiedPdfUrl: row.verifiedPdfUrl,
        cachedPdfPath: row.cachedPdfPath,
        problemCount: row._count.problems
      } satisfies ResourceScopeRow;
    })
  );

  return sortRows(checks.filter((row): row is ResourceScopeRow => row !== null));
}
