/**
 * Adapter between the teacher-facing upload schema (arcmath-problem-set-v1)
 * and the DB-side commit path in contest-import.ts.
 *
 * Why adapt instead of extending `importProblemSetSchema` directly?
 *
 *   - `importProblemSetSchema` hard-codes contest-specific shape (AMC/AIME
 *     only, fixed problem count, MULTIPLE_CHOICE/INTEGER/EXPRESSION only).
 *     Changing it would either loosen the contest validator dangerously or
 *     require a large refactor.
 *   - The teacher schema is more permissive in some ways (any contest,
 *     variable count, PROOF supported) and stricter in others (requires
 *     solutionSketch for PROOF). Keeping it as a separate validator means
 *     we can evolve the teacher contract independently.
 *   - Both still end up writing the same Problem / ProblemSet rows, so the
 *     actual DB-write helpers are reused verbatim.
 */

import { createHash } from "node:crypto";
import { Prisma } from "@arcmath/db";
import type {
  AnswerFormat,
  Contest,
  PrismaClient,
  ProblemSet,
  ProblemSetCategory,
  ProblemSetSubmissionMode,
  StatementFormat
} from "@arcmath/db";
import type { TeacherProblemSetInput } from "@arcmath/shared";
import {
  SCHEMA_VERSION,
  teacherProblemSetSchema
} from "@arcmath/shared";

// Shape we pass to the shared Problem.upsert helpers. Keep it structurally
// compatible with the teacher schema's problem shape — we just null-fill
// the fields the DB expects but teachers don't provide.
type TeacherProblemNormalized = {
  number: number;
  statement: string;
  statementFormat: StatementFormat;
  choices: string[] | null;
  answer: string | null;
  answerFormat: AnswerFormat;
  topicKey: string | null;
  techniqueTags: string[];
  difficultyBand: string | null;
  solutionSketch: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  curatedHintLevel1: string | null;
  curatedHintLevel2: string | null;
  curatedHintLevel3: string | null;
};

export type TeacherImportPreview = {
  isValid: boolean;
  format: "teacher-v1";
  problemSetKey: {
    contest: Contest;
    year: number;
    exam: string;
  } | null;
  titleSuggestion: string | null;
  problemCount: number;
  proofProblemCount: number;
  existingSet: boolean;
  existingProblemNumbers: number[];
  sample: Array<{ number: number; statementPreview: string }>;
  warnings: string[];
  errors: string[];
};

export type TeacherImportCommitResult = {
  problemSetId: string;
  createdProblems: number;
  updatedProblems: number;
  skippedProblems: number;
  /**
   * Problem rows (PROOF-format only) that now need milestone-recipe
   * preprocessing. The commit caller uses this to decide whether to fire
   * the auto-preprocess pipeline. Keyed by Problem.id so the worker can
   * grab them without re-querying.
   */
  pendingPreprocessProblemIds: string[];
  warnings: string[];
};

function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function statementPreview(statement: string): string {
  const withoutHtml = statement.replace(/<[^>]*>/g, " ");
  const cleaned = cleanWhitespace(withoutHtml);
  return cleaned.length <= 120 ? cleaned : `${cleaned.slice(0, 120)}...`;
}

function formatZodIssues(
  issues: Array<{ path: Array<string | number>; message: string }>
): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

export type TeacherParseResult = {
  data: TeacherProblemSetInput | null;
  errors: string[];
};

export function parseTeacherPayload(jsonText: string): TeacherParseResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    return { data: null, errors: ["Invalid JSON: unable to parse file contents"] };
  }

  const parsed = teacherProblemSetSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { data: null, errors: formatZodIssues(parsed.error.issues) };
  }
  return { data: parsed.data, errors: [] };
}

function normalizeProblem(
  problem: TeacherProblemSetInput["problems"][number]
): TeacherProblemNormalized {
  return {
    number: problem.number,
    statement: problem.statement,
    statementFormat: (problem.statementFormat ?? "MARKDOWN_LATEX") as StatementFormat,
    choices: problem.choices ?? null,
    answer: problem.answer ?? null,
    answerFormat: problem.answerFormat as AnswerFormat,
    topicKey: problem.topicKey ?? null,
    techniqueTags: problem.techniqueTags ?? [],
    difficultyBand: problem.difficultyBand ?? null,
    solutionSketch: problem.solutionSketch ?? null,
    sourceLabel: problem.sourceLabel ?? null,
    sourceUrl: problem.sourceUrl ?? null,
    curatedHintLevel1: problem.curatedHintLevel1 ?? null,
    curatedHintLevel2: problem.curatedHintLevel2 ?? null,
    curatedHintLevel3: problem.curatedHintLevel3 ?? null
  };
}

async function findExistingSet(
  prisma: PrismaClient,
  key: { contest: Contest; year: number; exam: string }
) {
  const existingSet = await prisma.problemSet.findFirst({
    where: { contest: key.contest, year: key.year, exam: key.exam },
    select: { id: true, title: true }
  });

  if (!existingSet) {
    return { existingSet: null, existingProblemNumbers: [] as number[] };
  }

  const existingProblems = await prisma.problem.findMany({
    where: { problemSetId: existingSet.id },
    select: { number: true },
    orderBy: { number: "asc" }
  });

  return {
    existingSet,
    existingProblemNumbers: existingProblems.map((p) => p.number)
  };
}

export async function buildTeacherImportPreview(
  prisma: PrismaClient,
  jsonText: string
): Promise<TeacherImportPreview> {
  const parsed = parseTeacherPayload(jsonText);
  if (!parsed.data) {
    return {
      isValid: false,
      format: "teacher-v1",
      problemSetKey: null,
      titleSuggestion: null,
      problemCount: 0,
      proofProblemCount: 0,
      existingSet: false,
      existingProblemNumbers: [],
      sample: [],
      warnings: [],
      errors: parsed.errors
    };
  }

  const payload = parsed.data;
  const key = {
    contest: payload.set.contest as Contest,
    year: payload.set.year,
    exam: payload.set.exam
  };
  const { existingSet, existingProblemNumbers } = await findExistingSet(prisma, key);

  const sample = payload.problems.slice(0, 3).map((p) => ({
    number: p.number,
    statementPreview: statementPreview(p.statement)
  }));

  const proofProblemCount = payload.problems.filter(
    (p) => p.answerFormat === "PROOF"
  ).length;

  const warnings: string[] = [];
  if (existingSet) {
    warnings.push(
      `A problem set with key (${key.contest}, ${key.year}, "${key.exam}") already exists — commit will update matching problems and insert new ones.`
    );
  }

  const incomingNumbers = new Set(payload.problems.map((p) => p.number));
  const overlappingNumbers = existingProblemNumbers.filter((n) =>
    incomingNumbers.has(n)
  );
  if (overlappingNumbers.length > 0) {
    warnings.push(
      `Problem numbers already present in existing set: ${overlappingNumbers.join(", ")}`
    );
  }

  if (proofProblemCount > 0) {
    warnings.push(
      `${proofProblemCount} PROOF problem(s) will be queued for milestone-recipe generation after commit (~15-30s per problem in parallel).`
    );
  }

  return {
    isValid: true,
    format: "teacher-v1",
    problemSetKey: key,
    titleSuggestion: payload.set.title,
    problemCount: payload.problems.length,
    proofProblemCount,
    existingSet: Boolean(existingSet),
    existingProblemNumbers,
    sample,
    warnings,
    errors: []
  };
}

function makeProblemCreateInput(
  problemSetId: string,
  p: TeacherProblemNormalized
): Prisma.ProblemCreateInput {
  return {
    problemSet: { connect: { id: problemSetId } },
    number: p.number,
    statement: p.statement,
    statementFormat: p.statementFormat,
    choices: p.choices ?? undefined,
    answer: p.answer ?? undefined,
    answerFormat: p.answerFormat,
    topicKey: p.topicKey,
    techniqueTags: p.techniqueTags,
    difficultyBand: p.difficultyBand,
    solutionSketch: p.solutionSketch,
    sourceLabel: p.sourceLabel,
    sourceUrl: p.sourceUrl,
    curatedHintLevel1: p.curatedHintLevel1,
    curatedHintLevel2: p.curatedHintLevel2,
    curatedHintLevel3: p.curatedHintLevel3,
    // PROOF problems start in PENDING so the preprocess worker knows to
    // pick them up. Non-PROOF problems don't need preprocessing, mark them
    // SKIPPED so the planner ignores them and admin UI can distinguish
    // "no work needed" from "still running".
    formalizedStatus: p.answerFormat === "PROOF" ? "PENDING" : "SKIPPED"
  };
}

function buildProblemUpdateData(
  incoming: TeacherProblemNormalized,
  existing: {
    statement: string | null;
    statementFormat: StatementFormat;
    choices: Prisma.JsonValue | null;
    answer: string | null;
    answerFormat: AnswerFormat;
    topicKey: string | null;
    techniqueTags: string[];
    difficultyBand: string | null;
    solutionSketch: string | null;
    sourceLabel: string | null;
    sourceUrl: string | null;
    curatedHintLevel1: string | null;
    curatedHintLevel2: string | null;
    curatedHintLevel3: string | null;
  }
): {
  updateData: Prisma.ProblemUpdateInput;
  solutionSketchChanged: boolean;
  answerFormatChanged: boolean;
} {
  const updateData: Prisma.ProblemUpdateInput = {};
  let solutionSketchChanged = false;
  let answerFormatChanged = false;

  if (incoming.statement !== existing.statement) {
    updateData.statement = incoming.statement;
  }
  if (incoming.statementFormat !== existing.statementFormat) {
    updateData.statementFormat = incoming.statementFormat;
  }
  if (
    JSON.stringify(incoming.choices ?? null) !==
    JSON.stringify(existing.choices ?? null)
  ) {
    updateData.choices = incoming.choices ?? Prisma.JsonNull;
  }
  if (incoming.answer !== existing.answer) {
    updateData.answer = incoming.answer;
  }
  if (incoming.answerFormat !== existing.answerFormat) {
    updateData.answerFormat = incoming.answerFormat;
    answerFormatChanged = true;
  }
  if (incoming.topicKey !== existing.topicKey) {
    updateData.topicKey = incoming.topicKey;
  }
  if (
    JSON.stringify(incoming.techniqueTags) !==
    JSON.stringify(existing.techniqueTags)
  ) {
    updateData.techniqueTags = incoming.techniqueTags;
  }
  if (incoming.difficultyBand !== existing.difficultyBand) {
    updateData.difficultyBand = incoming.difficultyBand;
  }
  if (incoming.solutionSketch !== existing.solutionSketch) {
    updateData.solutionSketch = incoming.solutionSketch;
    solutionSketchChanged = true;
  }
  if (incoming.sourceLabel !== existing.sourceLabel) {
    updateData.sourceLabel = incoming.sourceLabel;
  }
  if (incoming.sourceUrl !== existing.sourceUrl) {
    updateData.sourceUrl = incoming.sourceUrl;
  }
  if (incoming.curatedHintLevel1 !== existing.curatedHintLevel1) {
    updateData.curatedHintLevel1 = incoming.curatedHintLevel1;
  }
  if (incoming.curatedHintLevel2 !== existing.curatedHintLevel2) {
    updateData.curatedHintLevel2 = incoming.curatedHintLevel2;
  }
  if (incoming.curatedHintLevel3 !== existing.curatedHintLevel3) {
    updateData.curatedHintLevel3 = incoming.curatedHintLevel3;
  }

  return { updateData, solutionSketchChanged, answerFormatChanged };
}

async function resolveProblemSet(
  tx: Prisma.TransactionClient,
  payload: TeacherProblemSetInput,
  options: {
    ownerOrganizationId: string | null;
    ownerUserId: string | null;
    visibility: "PUBLIC" | "ORG_ONLY" | "CLASS_ONLY";
  }
): Promise<ProblemSet> {
  const existingSet = await tx.problemSet.findFirst({
    where: {
      contest: payload.set.contest as Contest,
      year: payload.set.year,
      exam: payload.set.exam
    }
  });

  const title = payload.set.title;
  // NOTE: payload.set.description is accepted by the teacher schema but
  // ProblemSet currently has no description column. Accept-and-ignore for
  // now; a future migration will persist it.
  const category = payload.set.category as ProblemSetCategory;
  const submissionMode = payload.set.submissionMode as ProblemSetSubmissionMode;
  const tutorEnabled = payload.set.tutorEnabled ?? true;
  const sourceUrl = payload.set.sourceUrl ?? null;

  if (existingSet) {
    // Important: do NOT silently re-tenant an existing set. If a teacher
    // uploads something with a key that collides with an arcmath-PUBLIC
    // set (e.g. AMC 10 2020), they'd stamp their own ownerOrganizationId
    // over it. Only update the owner fields if the set was previously
    // unowned (arcmath-public) AND the caller wants to keep it public.
    const isReTenanting =
      existingSet.ownerOrganizationId !== null &&
      existingSet.ownerOrganizationId !== options.ownerOrganizationId;
    if (isReTenanting) {
      throw new Error(
        `ProblemSet (${payload.set.contest}, ${payload.set.year}, "${payload.set.exam}") already exists and is owned by a different school.`
      );
    }
    return tx.problemSet.update({
      where: { id: existingSet.id },
      data: {
        title,
        category,
        submissionMode,
        tutorEnabled,
        sourceUrl: sourceUrl ?? existingSet.sourceUrl,
        // Only stamp ownership if currently unset. This lets an arcmath
        // admin do a teacher-style upload over a PUBLIC set without
        // changing its visibility.
        ownerOrganizationId:
          existingSet.ownerOrganizationId ?? options.ownerOrganizationId,
        ownerUserId: existingSet.ownerUserId ?? options.ownerUserId,
        visibility:
          existingSet.visibility === "PUBLIC" && options.visibility === "PUBLIC"
            ? "PUBLIC"
            : options.visibility
      }
    });
  }

  return tx.problemSet.create({
    data: {
      contest: payload.set.contest as Contest,
      year: payload.set.year,
      exam: payload.set.exam,
      title,
      category,
      submissionMode,
      tutorEnabled,
      sourceUrl,
      ownerOrganizationId: options.ownerOrganizationId,
      ownerUserId: options.ownerUserId,
      visibility: options.visibility
    }
  });
}

function hasUpdateData(updateData: Prisma.ProblemUpdateInput): boolean {
  return Object.keys(updateData).length > 0;
}

export async function commitTeacherImportFromJson(options: {
  prisma: PrismaClient;
  jsonText: string;
  filename?: string;
  uploadedByUserId: string;
  /** School tenant that owns the resulting ProblemSet. Null means arcmath-
   *  public (admin global content). When set, the resulting rows are
   *  scoped to that school and only visible to its members. */
  ownerOrganizationId?: string | null;
  /** Teacher who uploaded. Null means arcmath-admin global. */
  ownerUserId?: string | null;
  /** Defaults: PUBLIC when no organization owner, ORG_ONLY when there is. */
  visibility?: "PUBLIC" | "ORG_ONLY" | "CLASS_ONLY";
}): Promise<TeacherImportCommitResult> {
  const {
    prisma,
    jsonText,
    filename,
    uploadedByUserId,
    ownerOrganizationId = null,
    ownerUserId = null
  } = options;

  const resolvedVisibility: "PUBLIC" | "ORG_ONLY" | "CLASS_ONLY" =
    options.visibility ?? (ownerOrganizationId ? "ORG_ONLY" : "PUBLIC");

  const parsed = parseTeacherPayload(jsonText);
  if (!parsed.data) {
    throw new Error(parsed.errors.join(" | "));
  }
  const payload = parsed.data;

  const sha256 = createHash("sha256").update(jsonText).digest("hex");
  const importJob = await prisma.importJob.create({
    data: {
      uploadedByUserId,
      filename: filename ?? `teacher-${SCHEMA_VERSION}.json`,
      sha256,
      status: "PENDING"
    }
  });

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const problemSet = await resolveProblemSet(tx, payload, {
          ownerOrganizationId,
          ownerUserId,
          visibility: resolvedVisibility
        });
        let createdProblems = 0;
        let updatedProblems = 0;
        let skippedProblems = 0;
        const pendingPreprocessProblemIds: string[] = [];

        for (const rawProblem of payload.problems) {
          const incoming = normalizeProblem(rawProblem);

          const existingProblem = await tx.problem.findUnique({
            where: {
              problemSetId_number: {
                problemSetId: problemSet.id,
                number: incoming.number
              }
            }
          });

          if (!existingProblem) {
            const created = await tx.problem.create({
              data: makeProblemCreateInput(problemSet.id, incoming)
            });
            createdProblems += 1;
            if (incoming.answerFormat === "PROOF") {
              pendingPreprocessProblemIds.push(created.id);
            }
            continue;
          }

          const { updateData, solutionSketchChanged, answerFormatChanged } =
            buildProblemUpdateData(incoming, existingProblem);

          // If this update affects the grounding inputs for preprocessing
          // (answerFormat or solutionSketch), reset formalizedStatus so
          // the worker re-runs. Otherwise a stale VERIFIED recipe would
          // stick around.
          const needsRepreprocess =
            incoming.answerFormat === "PROOF" &&
            (solutionSketchChanged || answerFormatChanged);
          if (needsRepreprocess) {
            updateData.formalizedStatus = "PENDING";
            updateData.formalizedReason = null;
            updateData.milestoneChecks = Prisma.JsonNull;
          }

          if (!hasUpdateData(updateData)) {
            skippedProblems += 1;
            // Even when we didn't update, if the problem is still PENDING
            // after a previous partially-failed run, re-enqueue it. The
            // dedupe in preprocess will keep this safe.
            if (
              incoming.answerFormat === "PROOF" &&
              existingProblem.formalizedStatus === "PENDING"
            ) {
              pendingPreprocessProblemIds.push(existingProblem.id);
            }
            continue;
          }

          await tx.problem.update({
            where: { id: existingProblem.id },
            data: updateData
          });
          updatedProblems += 1;

          if (incoming.answerFormat === "PROOF" && needsRepreprocess) {
            pendingPreprocessProblemIds.push(existingProblem.id);
          }
        }

        return {
          problemSetId: problemSet.id,
          createdProblems,
          updatedProblems,
          skippedProblems,
          pendingPreprocessProblemIds,
          warnings: [] as string[]
        } satisfies TeacherImportCommitResult;
      },
      { maxWait: 10_000, timeout: 120_000 }
    );

    await prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status: "SUCCESS",
        report: {
          problemSetId: result.problemSetId,
          createdProblems: result.createdProblems,
          updatedProblems: result.updatedProblems,
          skippedProblems: result.skippedProblems,
          pendingPreprocessCount: result.pendingPreprocessProblemIds.length
        }
      }
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown import failure";
    await prisma.importJob.update({
      where: { id: importJob.id },
      data: { status: "FAILED", report: { errors: [message] } }
    });
    throw error;
  }
}
