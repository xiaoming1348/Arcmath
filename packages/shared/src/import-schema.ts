import { z } from "zod";

export const CONTESTS = ["AMC8", "AMC10", "AMC12", "AIME"] as const;
export const STATEMENT_FORMATS = ["MARKDOWN_LATEX", "HTML", "PLAIN"] as const;
export const ANSWER_FORMATS = ["MULTIPLE_CHOICE", "INTEGER", "EXPRESSION"] as const;
export const DIFFICULTY_BANDS = ["EASY", "MEDIUM", "HARD"] as const;

export const contestSchema = z.enum(CONTESTS);
export const statementFormatSchema = z.enum(STATEMENT_FORMATS);
export const answerFormatSchema = z.enum(ANSWER_FORMATS);
export const difficultyBandSchema = z.enum(DIFFICULTY_BANDS);

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

function expectedProblemCount(contest: z.infer<typeof contestSchema>): number {
  return contest === "AIME" ? 15 : 25;
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
    answer: trimmedNonEmptyString("Problem answer is required"),
    answerFormat: answerFormatSchema,
    topicKey: optionalTrimmedNonEmptyString("topicKey must be trimmed and non-empty"),
    difficultyBand: z.preprocess(trimString, difficultyBandSchema.optional()),
    solutionSketch: optionalTrimmedNonEmptyString("solutionSketch must be trimmed and non-empty"),
    curatedHintLevel1: optionalTrimmedNonEmptyString("curatedHintLevel1 must be trimmed and non-empty"),
    curatedHintLevel2: optionalTrimmedNonEmptyString("curatedHintLevel2 must be trimmed and non-empty"),
    curatedHintLevel3: optionalTrimmedNonEmptyString("curatedHintLevel3 must be trimmed and non-empty"),
    sourceUrl: optionalUrlString("Problem sourceUrl must be a valid URL")
  })
  .superRefine((problem, ctx) => {
    if (problem.answerFormat === "MULTIPLE_CHOICE") {
      if (!/^[A-E]$/.test(problem.answer)) {
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

      if (!normalizedIntegerPattern.test(problem.answer)) {
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

    if (payload.problems.length !== expectedCount) {
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

    for (let index = 0; index < expectedCount; index += 1) {
      const expectedNumber = index + 1;
      if (sortedNumbers[index] !== expectedNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["problems"],
          message: `${contest} problems must be numbered contiguously from 1 to ${expectedCount}.`
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
