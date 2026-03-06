import { createHash } from "node:crypto";
import type {
  AnswerFormat,
  Contest,
  Prisma,
  PrismaClient,
  ProblemSet,
  StatementFormat
} from "@arcmath/db";
import type { ImportProblemSetInput } from "@arcmath/shared";
import { importProblemSetSchema } from "@arcmath/shared";

type ImportProblem = ImportProblemSetInput["problems"][number];

export type ProblemSetKey = {
  contest: Contest;
  year: number;
  exam: string | null;
};

export type ImportPreviewResult = {
  isValid: boolean;
  problemSetKey: ProblemSetKey | null;
  titleSuggestion: string | null;
  problemCount: number;
  existingSet: boolean;
  existingProblemNumbers: number[];
  sample: Array<{
    number: number;
    statementPreview: string;
  }>;
  warnings: string[];
  errors: string[];
};

export type ImportCommitResult = {
  problemSetId: string;
  createdProblems: number;
  updatedProblems: number;
  skippedProblems: number;
  warnings: string[];
};

export type ImportParseResult = {
  data: ImportProblemSetInput | null;
  errors: string[];
};

function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function statementPreview(statement: string | undefined): string {
  if (!statement) {
    return "(no statement)";
  }

  const withoutHtml = statement.replace(/<[^>]*>/g, " ");
  const cleaned = cleanWhitespace(withoutHtml);
  if (cleaned.length <= 120) {
    return cleaned;
  }

  return `${cleaned.slice(0, 120)}...`;
}

function makeProblemSetWhere(key: ProblemSetKey): Prisma.ProblemSetWhereInput {
  return {
    contest: key.contest,
    year: key.year,
    exam: key.exam
  };
}

function toProblemSetKey(data: ImportProblemSetInput): ProblemSetKey {
  return {
    contest: data.problemSet.contest,
    year: data.problemSet.year,
    exam: data.problemSet.exam ?? null
  };
}

export function suggestProblemSetTitle(key: ProblemSetKey): string {
  switch (key.contest) {
    case "AMC8":
      return `AMC 8 ${key.year}`;
    case "AMC10":
      return `AMC 10${key.exam ?? ""} ${key.year}`;
    case "AMC12":
      return `AMC 12${key.exam ?? ""} ${key.year}`;
    case "AIME":
      return `AIME ${key.exam ?? ""} ${key.year}`;
    default:
      return `${key.contest} ${key.year}`;
  }
}

function formatZodIssues(issues: Array<{ path: Array<string | number>; message: string }>): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

export function parseImportPayload(jsonText: string): ImportParseResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    return {
      data: null,
      errors: ["Invalid JSON: unable to parse file contents"]
    };
  }

  const parsed = importProblemSetSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      data: null,
      errors: formatZodIssues(parsed.error.issues)
    };
  }

  return {
    data: parsed.data,
    errors: []
  };
}

async function findExistingSetWithNumbers(prisma: PrismaClient, key: ProblemSetKey) {
  const existingSet = await prisma.problemSet.findFirst({
    where: makeProblemSetWhere(key),
    select: {
      id: true
    }
  });

  if (!existingSet) {
    return {
      existingSet: null,
      existingProblemNumbers: [] as number[]
    };
  }

  const existingProblems = await prisma.problem.findMany({
    where: { problemSetId: existingSet.id },
    select: { number: true },
    orderBy: { number: "asc" }
  });

  return {
    existingSet,
    existingProblemNumbers: existingProblems.map((problem) => problem.number)
  };
}

async function buildPreviewFromParsed(prisma: PrismaClient, data: ImportProblemSetInput): Promise<ImportPreviewResult> {
  const key = toProblemSetKey(data);
  const titleSuggestion = suggestProblemSetTitle(key);
  const { existingSet, existingProblemNumbers } = await findExistingSetWithNumbers(prisma, key);

  const sample = data.problems.slice(0, 3).map((problem) => ({
    number: problem.number,
    statementPreview: statementPreview(problem.statement)
  }));

  const incomingNumbers = new Set(data.problems.map((problem) => problem.number));
  const overlappingNumbers = existingProblemNumbers.filter((number) => incomingNumbers.has(number));
  const warnings: string[] = [];
  const emptyStatementCount = data.problems.filter((problem) => !problem.statement || problem.statement.trim().length === 0).length;
  const emptyStatementRatio = data.problems.length > 0 ? emptyStatementCount / data.problems.length : 0;

  if (existingSet) {
    warnings.push("Problem set already exists; commit will update matching problems and insert new ones.");
  }

  if (overlappingNumbers.length > 0) {
    warnings.push(`Existing problem numbers in this file: ${overlappingNumbers.join(", ")}`);
  }

  if (emptyStatementCount > 0) {
    warnings.push(`Missing statements detected: ${emptyStatementCount}/${data.problems.length} problems have empty statement.`);
  }
  if (emptyStatementRatio >= 0.3) {
    warnings.push("Large portion of statements are empty. This often means the fetch/import source only included answers.");
  }

  return {
    isValid: true,
    problemSetKey: key,
    titleSuggestion,
    problemCount: data.problems.length,
    existingSet: Boolean(existingSet),
    existingProblemNumbers,
    sample,
    warnings,
    errors: []
  };
}

export async function buildImportPreview(prisma: PrismaClient, jsonText: string): Promise<ImportPreviewResult> {
  const parsed = parseImportPayload(jsonText);
  if (!parsed.data) {
    return {
      isValid: false,
      problemSetKey: null,
      titleSuggestion: null,
      problemCount: 0,
      existingSet: false,
      existingProblemNumbers: [],
      sample: [],
      warnings: [],
      errors: parsed.errors
    };
  }

  return buildPreviewFromParsed(prisma, parsed.data);
}

function makeProblemCreateInput(problemSetId: string, problem: ImportProblem): Prisma.ProblemCreateInput {
  return {
    problemSet: { connect: { id: problemSetId } },
    number: problem.number,
    statement: problem.statement,
    statementFormat: (problem.statementFormat ?? "MARKDOWN_LATEX") as StatementFormat,
    choices: problem.choices,
    answer: problem.answer,
    answerFormat: (problem.answerFormat ?? "MULTIPLE_CHOICE") as AnswerFormat,
    sourceUrl: problem.sourceUrl
  };
}

function buildProblemUpdateData(problem: ImportProblem, existing: {
  statement: string | null;
  statementFormat: StatementFormat;
  choices: Prisma.JsonValue | null;
  answer: string | null;
  answerFormat: AnswerFormat;
  sourceUrl: string | null;
}): Prisma.ProblemUpdateInput {
  const updateData: Prisma.ProblemUpdateInput = {};

  if (problem.statement !== undefined && problem.statement !== existing.statement) {
    updateData.statement = problem.statement;
  }
  if (problem.statementFormat !== undefined && problem.statementFormat !== existing.statementFormat) {
    updateData.statementFormat = problem.statementFormat as StatementFormat;
  }
  if (problem.choices !== undefined && JSON.stringify(problem.choices) !== JSON.stringify(existing.choices)) {
    updateData.choices = problem.choices;
  }
  if (problem.answer !== undefined && problem.answer !== existing.answer) {
    updateData.answer = problem.answer;
  }
  if (problem.answerFormat !== undefined && problem.answerFormat !== existing.answerFormat) {
    updateData.answerFormat = problem.answerFormat as AnswerFormat;
  }
  if (problem.sourceUrl !== undefined && problem.sourceUrl !== existing.sourceUrl) {
    updateData.sourceUrl = problem.sourceUrl;
  }

  return updateData;
}

async function resolveProblemSet(
  tx: Prisma.TransactionClient,
  key: ProblemSetKey,
  sourceUrl: string | undefined,
  verifiedPdfUrl: string | undefined
): Promise<ProblemSet> {
  const existingSet = await tx.problemSet.findFirst({
    where: makeProblemSetWhere(key)
  });

  const title = suggestProblemSetTitle(key);

  if (existingSet) {
    return tx.problemSet.update({
      where: { id: existingSet.id },
      data: {
        title,
        sourceUrl: sourceUrl ?? existingSet.sourceUrl,
        verifiedPdfUrl: verifiedPdfUrl ?? existingSet.verifiedPdfUrl
      }
    });
  }

  return tx.problemSet.create({
    data: {
      contest: key.contest,
      year: key.year,
      exam: key.exam,
      title,
      sourceUrl,
      verifiedPdfUrl
    }
  });
}

function hasUpdateData(updateData: Prisma.ProblemUpdateInput): boolean {
  return Object.keys(updateData).length > 0;
}

export async function commitImportFromJson(options: {
  prisma: PrismaClient;
  jsonText: string;
  filename?: string;
  uploadedByUserId: string;
}): Promise<ImportCommitResult> {
  const { prisma, jsonText, filename, uploadedByUserId } = options;

  const parsed = parseImportPayload(jsonText);
  if (!parsed.data) {
    throw new Error(parsed.errors.join(" | "));
  }
  const payload = parsed.data;

  const preview = await buildPreviewFromParsed(prisma, payload);
  const sha256 = createHash("sha256").update(jsonText).digest("hex");

  const importJob = await prisma.importJob.create({
    data: {
      uploadedByUserId,
      filename: filename ?? "inline.json",
      sha256,
      status: "PENDING"
    }
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const problemSet = await resolveProblemSet(
        tx,
        toProblemSetKey(payload),
        payload.problemSet.sourceUrl,
        payload.problemSet.verifiedPdfUrl
      );
      let createdProblems = 0;
      let updatedProblems = 0;
      let skippedProblems = 0;

      for (const problem of payload.problems) {
        const existingProblem = await tx.problem.findUnique({
          where: {
            problemSetId_number: {
              problemSetId: problemSet.id,
              number: problem.number
            }
          }
        });

        if (!existingProblem) {
          await tx.problem.create({
            data: makeProblemCreateInput(problemSet.id, problem)
          });
          createdProblems += 1;
          continue;
        }

        const updateData = buildProblemUpdateData(problem, existingProblem);
        if (!hasUpdateData(updateData)) {
          skippedProblems += 1;
          continue;
        }

        await tx.problem.update({
          where: { id: existingProblem.id },
          data: updateData
        });
        updatedProblems += 1;
      }

      return {
        problemSetId: problemSet.id,
        createdProblems,
        updatedProblems,
        skippedProblems,
        warnings: preview.warnings
      };
    });

    await prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status: "SUCCESS",
        report: result
      }
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown import failure";
    await prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status: "FAILED",
        report: {
          errors: [message]
        }
      }
    });
    throw error;
  }
}
