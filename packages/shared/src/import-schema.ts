import { z } from "zod";

// Contests this import pipeline knows how to validate. The order matters
// only for stable snapshot diffs — keep it roughly (US admissions →
// olympiad → UK/Canada admissions).
export const CONTESTS = [
  "AMC8",
  "AMC10",
  "AMC12",
  "AIME",
  "USAMO",
  "EUCLID",
  "MAT",
  "STEP"
] as const;
// Subset used for per-problem `examTrack` tagging on diagnostic sets.
// MC/integer-graded contests only — a proof-heavy contest doesn't make
// sense as a "diagnostic track" because you can't auto-grade it.
export const DIAGNOSTIC_EXAMS = ["AMC8", "AMC10", "AMC12"] as const;
export const STATEMENT_FORMATS = ["MARKDOWN_LATEX", "HTML", "PLAIN"] as const;
// WORKED_SOLUTION: long-form question where we show the official solution
// for self-check rather than auto-grading. Reserved for STEP full
// questions, MAT long questions (Q2–Q7), and Euclid Part B/C. PROOF
// (Lean-verified) is routed differently and currently out of scope for
// the admissions track.
export const ANSWER_FORMATS = [
  "MULTIPLE_CHOICE",
  "INTEGER",
  "EXPRESSION",
  "WORKED_SOLUTION"
] as const;
export const DIFFICULTY_BANDS = ["EASY", "MEDIUM", "HARD"] as const;
export const PROBLEM_SET_CATEGORIES = ["DIAGNOSTIC", "REAL_EXAM", "TOPIC_PRACTICE"] as const;
export const PROBLEM_SET_SUBMISSION_MODES = ["WHOLE_SET_SUBMIT", "PER_PROBLEM"] as const;
export const DIAGNOSTIC_STAGES = ["EARLY", "MID", "LATE"] as const;

export const contestSchema = z.enum(CONTESTS);
export const diagnosticExamSchema = z.enum(DIAGNOSTIC_EXAMS);
export const statementFormatSchema = z.enum(STATEMENT_FORMATS);
export const answerFormatSchema = z.enum(ANSWER_FORMATS);
export const difficultyBandSchema = z.enum(DIFFICULTY_BANDS);
export const problemSetCategorySchema = z.enum(PROBLEM_SET_CATEGORIES);
export const problemSetSubmissionModeSchema = z.enum(PROBLEM_SET_SUBMISSION_MODES);
export const diagnosticStageSchema = z.enum(DIAGNOSTIC_STAGES);

const currentYear = new Date().getFullYear();
const placeholderStatementPattern = /^(?:TBD|TODO)$/i;
const normalizedIntegerPattern = /^(?:0|-?[1-9]\d*)$/;

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function trimmedNonEmptyString(message: string) {
  return z.preprocess(trimString, z.string().min(1, message));
}

function optionalTrimmedNonEmptyString(message: string) {
  return z.preprocess(trimString, z.string().min(1, message).optional());
}

function optionalTrimmedNonEmptyStringArray(message: string) {
  return z
    .array(trimmedNonEmptyString(message))
    .optional()
    .refine((value) => !value || new Set(value).size === value.length, {
      message: "techniqueTags must not contain duplicates."
    });
}

function optionalUrlString(message: string) {
  return z.preprocess(trimString, z.string().url(message).optional());
}

function optionalUrlOrRootRelativePathString(message: string) {
  return z.preprocess(
    trimString,
    z
      .string()
      .refine((value) => /^https?:\/\//u.test(value) || value.startsWith("/"), message)
      .optional()
  );
}

/**
 * Number of problems we expect a full paper to contain. Used to enforce
 * "you must upload a complete set" for contests with a fixed structure
 * (AMC/AIME). Returns `null` for contests whose per-year structure varies
 * or where we don't want to hard-gate on count yet (new admissions
 * contests — see importer doc for their natural sizes):
 *   - USAMO: 6 problems (2 days × 3)
 *   - EUCLID: 10 questions (CEMC fixed)
 *   - MAT: flattened to 16 (Q1 has 10 MC subparts, then Q2–Q7)
 *   - STEP: 12 questions per paper (I/II/III), students pick 6
 * Relaxing to `null` keeps the importer flexible while the per-contest
 * preprocessors stabilize.
 */
function expectedProblemCount(contest: z.infer<typeof contestSchema>): number | null {
  switch (contest) {
    case "AMC8":
    case "AMC10":
    case "AMC12":
      return 25;
    case "AIME":
      return 15;
    case "USAMO":
      return 6;
    case "EUCLID":
      return 10;
    case "MAT":
    case "STEP":
      // Relaxed during initial ingestion — the per-contest importer
      // decides the shape. Flip to a fixed count once coverage
      // stabilizes.
      return null;
  }
}

const normalizedExamSchema = z
  .preprocess((value) => (typeof value === "string" ? value.trim().toUpperCase() : value), z.string().optional().nullable())
  .transform((value) => {
    if (!value) {
      return null;
    }
    return value;
  });

const importProblemSchema = z
  .object({
    number: z.number().int().min(1, "Problem number must be an integer >= 1"),
    statement: trimmedNonEmptyString("Problem statement is required").refine(
      (value) => !placeholderStatementPattern.test(value),
      "Problem statement cannot be a placeholder like TBD or TODO"
    ),
    diagramImageUrl: optionalUrlOrRootRelativePathString(
      "diagramImageUrl must be an absolute URL or a root-relative path."
    ),
    diagramImageAlt: optionalTrimmedNonEmptyString("diagramImageAlt must be trimmed and non-empty"),
    choicesImageUrl: optionalUrlOrRootRelativePathString(
      "choicesImageUrl must be an absolute URL or a root-relative path."
    ),
    choicesImageAlt: optionalTrimmedNonEmptyString("choicesImageAlt must be trimmed and non-empty"),
    statementFormat: statementFormatSchema.optional(),
    choices: z.array(trimmedNonEmptyString("Choice text must be non-empty")).optional(),
    // Required for MULTIPLE_CHOICE/INTEGER/EXPRESSION (checked in
    // superRefine). WORKED_SOLUTION problems may omit `answer` entirely
    // — some STEP/MAT long questions are "show that…" with no single
    // scalar to record. `solutionSketch` becomes the authoritative
    // answer carrier in that case.
    answer: optionalTrimmedNonEmptyString("Problem answer must be trimmed and non-empty"),
    answerFormat: answerFormatSchema,
    examTrack: z.preprocess(trimString, diagnosticExamSchema.optional()),
    sourceLabel: optionalTrimmedNonEmptyString("sourceLabel must be trimmed and non-empty"),
    topicKey: optionalTrimmedNonEmptyString("topicKey must be trimmed and non-empty"),
    techniqueTags: optionalTrimmedNonEmptyStringArray("techniqueTags entries must be trimmed and non-empty"),
    diagnosticEligible: z.boolean().optional(),
    difficultyBand: z.preprocess(trimString, difficultyBandSchema.optional()),
    solutionSketch: optionalTrimmedNonEmptyString("solutionSketch must be trimmed and non-empty"),
    curatedHintLevel1: optionalTrimmedNonEmptyString("curatedHintLevel1 must be trimmed and non-empty"),
    curatedHintLevel2: optionalTrimmedNonEmptyString("curatedHintLevel2 must be trimmed and non-empty"),
    curatedHintLevel3: optionalTrimmedNonEmptyString("curatedHintLevel3 must be trimmed and non-empty"),
    sourceUrl: optionalUrlString("Problem sourceUrl must be a valid URL")
  })
  .superRefine((problem, ctx) => {
    // `answer` is required for every format EXCEPT WORKED_SOLUTION — see
    // the comment on the `answer` field above. The top-level schema made
    // it optional so we could branch here.
    if (problem.answerFormat !== "WORKED_SOLUTION" && !problem.answer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answer"],
        message: `Problem answer is required for ${problem.answerFormat}.`
      });
    }

    if (problem.answerFormat === "MULTIPLE_CHOICE") {
      if (problem.answer && !/^[A-E]$/.test(problem.answer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answer"],
          message: 'For MULTIPLE_CHOICE, answer must be exactly one of "A" through "E".'
        });
      }

      if (!problem.choices || problem.choices.length !== 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "For MULTIPLE_CHOICE, choices must contain exactly 5 non-empty strings."
        });
      }
    }

    if (problem.answerFormat === "INTEGER") {
      if (problem.choices !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "For INTEGER, choices must be absent."
        });
      }

      if (problem.answer && !normalizedIntegerPattern.test(problem.answer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answer"],
          message: "For INTEGER, answer must be a normalized integer string."
        });
      }
    }

    if (problem.answerFormat === "EXPRESSION") {
      if (problem.choices !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "For EXPRESSION, choices must be absent."
        });
      }
    }

    if (problem.answerFormat === "WORKED_SOLUTION") {
      if (problem.choices !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "For WORKED_SOLUTION, choices must be absent."
        });
      }
      // No auto-grading for this format — insist on an authoritative
      // official solution so the student has something to compare
      // against. Otherwise the problem is useless in the UI (just a
      // statement with no check path).
      if (!problem.solutionSketch) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["solutionSketch"],
          message:
            "For WORKED_SOLUTION, solutionSketch is required — it is the authoritative official solution shown to the student."
        });
      }
    }

    const curatedHints = [
      problem.curatedHintLevel1,
      problem.curatedHintLevel2,
      problem.curatedHintLevel3
    ].filter((hint): hint is string => typeof hint === "string");
    if (new Set(curatedHints).size !== curatedHints.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["curatedHintLevel2"],
        message: "Curated hint levels must not repeat the same text."
      });
    }

  });

const importProblemSetMetaSchema = z.object({
  contest: contestSchema,
  year: z
    .number()
    .int("Year must be an integer")
    .min(1950, "Year must be >= 1950")
    .max(currentYear + 1, `Year must be <= ${currentYear + 1}`),
  exam: normalizedExamSchema.optional(),
  category: problemSetCategorySchema.optional(),
  diagnosticStage: diagnosticStageSchema.optional(),
  submissionMode: problemSetSubmissionModeSchema.optional(),
  tutorEnabled: z.boolean().optional(),
  sourceUrl: optionalUrlString("problemSet.sourceUrl must be a valid URL"),
  verifiedPdfUrl: optionalUrlString("problemSet.verifiedPdfUrl must be a valid URL")
});

export const importProblemSetSchema = z
  .object({
    problemSet: importProblemSetMetaSchema,
    problems: z.array(importProblemSchema).min(1, "At least one problem is required")
  })
  .superRefine((payload, ctx) => {
    const exam = payload.problemSet.exam ?? null;
    const contest = payload.problemSet.contest;
    const expectedCount = expectedProblemCount(contest);

    // Per-contest exam validation. Contests with no exam variant must
    // pass null; contests with variants must match their allowed set.
    if (contest === "AMC8" && exam !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["problemSet", "exam"],
        message: "AMC8 does not use exam variants. Remove exam or set it to null."
      });
    }

    if ((contest === "AMC10" || contest === "AMC12") && exam !== "A" && exam !== "B") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["problemSet", "exam"],
        message: `${contest} requires exam to be "A" or "B".`
      });
    }

    if (contest === "AIME" && exam !== "I" && exam !== "II") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["problemSet", "exam"],
        message: 'AIME requires exam to be "I" or "II".'
      });
    }

    // USAMO / EUCLID / MAT are one paper per year, no exam variants.
    if ((contest === "USAMO" || contest === "EUCLID" || contest === "MAT") && exam !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["problemSet", "exam"],
        message: `${contest} does not use exam variants. Remove exam or set it to null.`
      });
    }

    // STEP: papers are labelled I / II / III. STEP I was discontinued
    // after the June 2020 session; we still accept it here for historical
    // ingestion (2016–2020 archive).
    if (contest === "STEP" && exam !== "I" && exam !== "II" && exam !== "III") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["problemSet", "exam"],
        message: 'STEP requires exam to be "I", "II", or "III".'
      });
    }

    for (const problem of payload.problems) {
      if (problem.examTrack && problem.examTrack !== contest) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["problems", problem.number - 1, "examTrack"],
          message: `Problem examTrack ${problem.examTrack} must match problemSet contest ${contest}.`
        });
      }

      if (contest === "AIME" && problem.examTrack) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["problems", problem.number - 1, "examTrack"],
          message: "AIME problems should not set examTrack."
        });
      }
    }

    if (expectedCount !== null && payload.problems.length !== expectedCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["problems"],
        message: `${contest} must contain exactly ${expectedCount} problems.`
      });
    }

    const seen = new Set<number>();
    const sortedNumbers = [...payload.problems.map((problem) => problem.number)].sort((left, right) => left - right);
    for (const problem of payload.problems) {
      if (seen.has(problem.number)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["problems"],
          message: `Duplicate problem number found in file: ${problem.number}`
        });
      }
      seen.add(problem.number);
    }

    // Contiguous-numbering check. For fixed-size contests we verify
    // 1..expectedCount; for relaxed contests (MAT/STEP) we just verify
    // 1..problems.length. Either way the rule is "no gaps".
    const requiredLength = expectedCount ?? payload.problems.length;
    for (let index = 0; index < requiredLength; index += 1) {
      const expectedNumber = index + 1;
      if (sortedNumbers[index] !== expectedNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["problems"],
          message: `${contest} problems must be numbered contiguously from 1 to ${requiredLength}.`
        });
        break;
      }
    }
  })
  .transform((payload) => ({
    ...payload,
    problemSet: {
      ...payload.problemSet,
      exam: payload.problemSet.exam ?? null
    }
  }));

export type ImportProblemSetInput = z.infer<typeof importProblemSetSchema>;
export type Contest = z.infer<typeof contestSchema>;
export type DiagnosticExam = z.infer<typeof diagnosticExamSchema>;
