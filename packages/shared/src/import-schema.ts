import { z } from "zod";

export const CONTESTS = ["AMC8", "AMC10", "AMC12", "AIME"] as const;
export const STATEMENT_FORMATS = ["MARKDOWN_LATEX", "HTML", "PLAIN"] as const;
export const ANSWER_FORMATS = ["MULTIPLE_CHOICE", "INTEGER", "EXPRESSION"] as const;

export const contestSchema = z.enum(CONTESTS);
export const statementFormatSchema = z.enum(STATEMENT_FORMATS);
export const answerFormatSchema = z.enum(ANSWER_FORMATS);

const currentYear = new Date().getFullYear();

const normalizedExamSchema = z
  .preprocess((value) => (typeof value === "string" ? value.trim().toUpperCase() : value), z.string().optional().nullable())
  .transform((value) => {
    if (!value) {
      return null;
    }
    return value;
  });

const importProblemSchema = z.object({
  number: z.number().int().min(1, "Problem number must be an integer >= 1"),
  statement: z
    .preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().optional())
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  statementFormat: statementFormatSchema.optional(),
  choices: z
    .array(z.preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string()))
    .optional()
    .transform((value) => {
      if (!value) {
        return undefined;
      }
      const normalized = value.filter((item) => item.length > 0);
      return normalized.length > 0 ? normalized : undefined;
    }),
  answer: z
    .preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().optional())
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  answerFormat: answerFormatSchema.optional(),
  sourceUrl: z.string().url("Problem sourceUrl must be a valid URL").optional()
});

const importProblemSetMetaSchema = z.object({
  contest: contestSchema,
  year: z
    .number()
    .int("Year must be an integer")
    .min(1950, "Year must be >= 1950")
    .max(currentYear + 1, `Year must be <= ${currentYear + 1}`),
  exam: normalizedExamSchema.optional(),
  sourceUrl: z.string().url("problemSet.sourceUrl must be a valid URL").optional(),
  verifiedPdfUrl: z.string().url("problemSet.verifiedPdfUrl must be a valid URL").optional()
});

export const importProblemSetSchema = z
  .object({
    problemSet: importProblemSetMetaSchema,
    problems: z.array(importProblemSchema).min(1, "At least one problem is required")
  })
  .superRefine((payload, ctx) => {
    const exam = payload.problemSet.exam ?? null;
    const contest = payload.problemSet.contest;

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

    const seen = new Set<number>();
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
