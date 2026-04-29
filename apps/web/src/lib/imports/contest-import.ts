import { createHash } from "node:crypto";
import type {
  AnswerFormat,
  Contest,
  ExamTrack,
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

function statementPreview(statement: string): string {
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
    case "USAMO":
      return `USAMO ${key.year}`;
    case "USAJMO":
      return `USAJMO ${key.year}`;
    case "IMO":
      return `IMO ${key.year}`;
    case "CMO":
      return `CMO ${key.year}`;
    case "PUTNAM":
      return `Putnam ${key.year}`;
    case "EUCLID":
      return `Euclid ${key.year}`;
    case "MAT":
      return `MAT ${key.year}`;
    case "STEP":
      // STEP papers are labelled I / II / III. Exam is required by the
      // schema for STEP, but we fall back defensively in case a caller
      // passes a key without it (e.g. from a partial preview path).
      return key.exam ? `STEP ${key.exam} ${key.year}` : `STEP ${key.year}`;
    case "PRACTICE":
      return `Practice ${key.year}`;
    default: {
      // Exhaustiveness check — TypeScript will flag missing contest
      // branches here if a new value is added to the Contest enum.
      const exhaustive: never = key.contest;
      return `${String(exhaustive)} ${key.year}`;
    }
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

  // Contest-aware format expectation. AMC and AIME have a single
  // canonical answer format; admissions-track papers (USAMO / EUCLID
  // / MAT / STEP) legitimately mix MULTIPLE_CHOICE, INTEGER,
  // EXPRESSION, and WORKED_SOLUTION within a single paper, so the
  // mismatch-warning only fires for the contests where a uniform
  // format is actually expected. This keeps the admin preview UI
  // quiet on the new contests while still flagging genuine AMC/AIME
  // authoring mistakes.
  const expectedFormat: "MULTIPLE_CHOICE" | "INTEGER" | null = (() => {
    switch (data.problemSet.contest) {
      case "AMC8":
      case "AMC10":
      case "AMC12":
        return "MULTIPLE_CHOICE";
      case "AIME":
        return "INTEGER";
      case "USAMO":
      case "EUCLID":
      case "MAT":
      case "STEP":
        // Mixed-format by design — no single expected format.
        return null;
    }
  })();

  const formatMismatchCount =
    expectedFormat === null
      ? 0
      : data.problems.filter((problem) => problem.answerFormat !== expectedFormat).length;

  if (existingSet) {
    warnings.push("Problem set already exists; commit will update matching problems and insert new ones.");
  }

  if (overlappingNumbers.length > 0) {
    warnings.push(`Existing problem numbers in this file: ${overlappingNumbers.join(", ")}`);
  }

  if (formatMismatchCount > 0 && expectedFormat !== null) {
    const canonical = expectedFormat === "INTEGER" ? "INTEGER" : "MULTIPLE_CHOICE";
    warnings.push(
      `${data.problemSet.contest} normally uses ${canonical} answers; ${formatMismatchCount} problem(s) use a different answerFormat.`
    );
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
    diagramImageUrl: problem.diagramImageUrl,
    diagramImageAlt: problem.diagramImageAlt,
    choicesImageUrl: problem.choicesImageUrl,
    choicesImageAlt: problem.choicesImageAlt,
    statementFormat: (problem.statementFormat ?? "MARKDOWN_LATEX") as StatementFormat,
    choices: problem.choices,
    answer: problem.answer,
    answerFormat: (problem.answerFormat ?? "MULTIPLE_CHOICE") as AnswerFormat,
    examTrack: (problem.examTrack ?? null) as ExamTrack | null,
    sourceLabel: problem.sourceLabel,
    topicKey: problem.topicKey,
    techniqueTags: problem.techniqueTags ?? [],
    diagnosticEligible: problem.diagnosticEligible ?? false,
    difficultyBand: problem.difficultyBand,
    solutionSketch: problem.solutionSketch,
    curatedHintLevel1: problem.curatedHintLevel1,
    curatedHintLevel2: problem.curatedHintLevel2,
    curatedHintLevel3: problem.curatedHintLevel3,
    sourceUrl: problem.sourceUrl
  };
}

function buildProblemUpdateData(problem: ImportProblem, existing: {
  statement: string | null;
  diagramImageUrl: string | null;
  diagramImageAlt: string | null;
  choicesImageUrl: string | null;
  choicesImageAlt: string | null;
  statementFormat: StatementFormat;
  choices: Prisma.JsonValue | null;
  answer: string | null;
  answerFormat: AnswerFormat;
  examTrack: ExamTrack | null;
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
}): Prisma.ProblemUpdateInput {
  const updateData: Prisma.ProblemUpdateInput = {};

  if (problem.statement !== undefined && problem.statement !== existing.statement) {
    updateData.statement = problem.statement;
  }
  if (problem.diagramImageUrl !== undefined && problem.diagramImageUrl !== existing.diagramImageUrl) {
    updateData.diagramImageUrl = problem.diagramImageUrl;
  }
  if (problem.diagramImageAlt !== undefined && problem.diagramImageAlt !== existing.diagramImageAlt) {
    updateData.diagramImageAlt = problem.diagramImageAlt;
  }
  if (problem.choicesImageUrl !== undefined && problem.choicesImageUrl !== existing.choicesImageUrl) {
    updateData.choicesImageUrl = problem.choicesImageUrl;
  }
  if (problem.choicesImageAlt !== undefined && problem.choicesImageAlt !== existing.choicesImageAlt) {
    updateData.choicesImageAlt = problem.choicesImageAlt;
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
  if ((problem.examTrack ?? null) !== existing.examTrack) {
    updateData.examTrack = (problem.examTrack ?? null) as ExamTrack | null;
  }
  if (problem.sourceLabel !== undefined && problem.sourceLabel !== existing.sourceLabel) {
    updateData.sourceLabel = problem.sourceLabel;
  }
  if (problem.topicKey !== undefined && problem.topicKey !== existing.topicKey) {
    updateData.topicKey = problem.topicKey;
  }
  const incomingTechniqueTags = problem.techniqueTags ?? [];
  if (JSON.stringify(incomingTechniqueTags) !== JSON.stringify(existing.techniqueTags)) {
    updateData.techniqueTags = incomingTechniqueTags;
  }
  if ((problem.diagnosticEligible ?? false) !== existing.diagnosticEligible) {
    updateData.diagnosticEligible = problem.diagnosticEligible ?? false;
  }
  if (problem.difficultyBand !== undefined && problem.difficultyBand !== existing.difficultyBand) {
    updateData.difficultyBand = problem.difficultyBand;
  }
  if (problem.solutionSketch !== undefined && problem.solutionSketch !== existing.solutionSketch) {
    updateData.solutionSketch = problem.solutionSketch;
  }
  if (problem.curatedHintLevel1 !== undefined && problem.curatedHintLevel1 !== existing.curatedHintLevel1) {
    updateData.curatedHintLevel1 = problem.curatedHintLevel1;
  }
  if (problem.curatedHintLevel2 !== undefined && problem.curatedHintLevel2 !== existing.curatedHintLevel2) {
    updateData.curatedHintLevel2 = problem.curatedHintLevel2;
  }
  if (problem.curatedHintLevel3 !== undefined && problem.curatedHintLevel3 !== existing.curatedHintLevel3) {
    updateData.curatedHintLevel3 = problem.curatedHintLevel3;
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
  verifiedPdfUrl: string | undefined,
  category: "DIAGNOSTIC" | "REAL_EXAM" | "TOPIC_PRACTICE" | undefined,
  diagnosticStage: "EARLY" | "MID" | "LATE" | undefined,
  submissionMode: "WHOLE_SET_SUBMIT" | "PER_PROBLEM" | undefined,
  tutorEnabled: boolean | undefined
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
        category: category ?? existingSet.category,
        diagnosticStage: diagnosticStage ?? existingSet.diagnosticStage,
        submissionMode: submissionMode ?? existingSet.submissionMode,
        tutorEnabled: tutorEnabled ?? existingSet.tutorEnabled,
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
      category: category ?? "REAL_EXAM",
      diagnosticStage: diagnosticStage ?? null,
      submissionMode: submissionMode ?? "WHOLE_SET_SUBMIT",
      tutorEnabled: tutorEnabled ?? false,
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
    const result = await prisma.$transaction(
      async (tx) => {
        const problemSet = await resolveProblemSet(
          tx,
          toProblemSetKey(payload),
          payload.problemSet.sourceUrl,
          payload.problemSet.verifiedPdfUrl,
          payload.problemSet.category,
          payload.problemSet.diagnosticStage,
          payload.problemSet.submissionMode,
          payload.problemSet.tutorEnabled
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
      },
      {
        maxWait: 10_000,
        timeout: 120_000
      }
    );

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
