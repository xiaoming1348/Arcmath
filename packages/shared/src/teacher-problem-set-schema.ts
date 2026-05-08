/**
 * Teacher-facing problem-set upload schema ("arcmath-problem-set-v1").
 *
 * Why a second schema (vs. extending importProblemSetSchema)?
 *
 *  - importProblemSetSchema is contest-import oriented: it hard-codes AMC/AIME
 *    problem counts (25 / 15), rejects answerFormat=PROOF, and only accepts the
 *    Contest enum subset AMC8/AMC10/AMC12/AIME. Teachers assigning homework
 *    need none of that and will stumble over all of it.
 *
 *  - This schema is optimized for the daily-homework-assignment use-case.
 *    `set.contest` defaults to PRACTICE, `set.year` defaults to the current
 *    year, `set.exam` is a free-form slug (auto-derived from the title when
 *    omitted), problem count is unconstrained, and `answerFormat: "PROOF"` is
 *    a first-class option.
 *
 *  - For PROOF problems the author MUST provide `solutionSketch` — it's what
 *    the milestone-recipe generator grounds on. Without it the auto-
 *    preprocessing pipeline cannot produce a checklist, and per-step grading
 *    falls back to opaque LLM judge only.
 *
 * The downstream `contest-import` commit path stays the authoritative writer
 * of Problem / ProblemSet rows. We convert this payload into an
 * ImportProblemSetInput-shaped object before calling the commit helper, and
 * we also emit the metadata we need to auto-trigger preprocess afterwards.
 */

import { z } from "zod";

// Re-use the underlying DB enums. We widen the contest set from the
// contest-import schema (AMC*/AIME) to include every contest the DB actually
// accepts, because teachers may legitimately upload PRACTICE content or a
// USAMO mock paper.
export const TEACHER_CONTESTS = [
  "AMC8",
  "AMC10",
  "AMC12",
  "AIME",
  "USAMO",
  "USAJMO",
  "IMO",
  "CMO",
  "PUTNAM",
  "PRACTICE"
] as const;

export const TEACHER_STATEMENT_FORMATS = ["MARKDOWN_LATEX", "HTML", "PLAIN"] as const;
export const TEACHER_ANSWER_FORMATS = [
  "MULTIPLE_CHOICE",
  "INTEGER",
  "EXPRESSION",
  "PROOF"
] as const;
export const TEACHER_DIFFICULTY_BANDS = ["EASY", "MEDIUM", "HARD"] as const;
export const TEACHER_PROBLEM_SET_CATEGORIES = [
  "DIAGNOSTIC",
  "REAL_EXAM",
  "TOPIC_PRACTICE"
] as const;
export const TEACHER_PROBLEM_SET_SUBMISSION_MODES = [
  "WHOLE_SET_SUBMIT",
  "PER_PROBLEM"
] as const;

export const SCHEMA_VERSION = "arcmath-problem-set-v1" as const;

const currentYear = new Date().getFullYear();

const placeholderStatementPattern = /^(?:TBD|TODO)$/i;
const normalizedIntegerPattern = /^(?:0|-?[1-9]\d*)$/;

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function trimmed(min: number, message: string) {
  return z.preprocess(trimString, z.string().min(min, message));
}

function optionalTrimmed(message: string) {
  return z.preprocess(trimString, z.string().min(1, message).optional());
}

function optionalUrl(message: string) {
  return z.preprocess(trimString, z.string().url(message).optional());
}

/**
 * Turn a human-readable title into a stable, URL-safe slug we can use as the
 * ProblemSet.exam discriminator. Teachers can upload many homework sets in
 * the same year; without this we'd collide on the (contest, year, exam)
 * unique constraint and the upload would fail opaquely.
 *
 * Deliberately deterministic (no random suffix) so re-uploading the same
 * file is idempotent — it updates the same ProblemSet.
 */
export function slugifyForExam(title: string): string {
  const ascii = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const trimmed = ascii.slice(0, 48);
  return trimmed || "untitled";
}

const teacherProblemSchema = z
  .object({
    number: z
      .number()
      .int("Problem number must be an integer >= 1")
      .min(1, "Problem number must be an integer >= 1"),
    statement: trimmed(1, "Problem statement is required").refine(
      (value) => !placeholderStatementPattern.test(value),
      "Problem statement cannot be a placeholder like TBD or TODO"
    ),
    statementFormat: z.enum(TEACHER_STATEMENT_FORMATS).optional(),
    answerFormat: z.enum(TEACHER_ANSWER_FORMATS),
    // Required for non-PROOF; forbidden for PROOF (there is no single
    // answer). Validated in superRefine below.
    answer: z.preprocess(trimString, z.string().optional()),
    // Required for MULTIPLE_CHOICE (exactly 5), forbidden otherwise.
    choices: z.array(trimmed(1, "Choice text must be non-empty")).optional(),
    // Required for PROOF — grounds the milestone-recipe generator.
    // Optional but recommended for other formats; when present it's used as
    // a hint to the autoformalizer and seeded into the solution viewer.
    solutionSketch: optionalTrimmed("solutionSketch must be trimmed and non-empty"),
    topicKey: optionalTrimmed("topicKey must be trimmed and non-empty"),
    difficultyBand: z
      .preprocess(trimString, z.enum(TEACHER_DIFFICULTY_BANDS).optional()),
    techniqueTags: z
      .array(trimmed(1, "techniqueTags entries must be trimmed and non-empty"))
      .optional()
      .refine(
        (value) => !value || new Set(value).size === value.length,
        "techniqueTags must not contain duplicates"
      ),
    sourceLabel: optionalTrimmed("sourceLabel must be trimmed and non-empty"),
    sourceUrl: optionalUrl("sourceUrl must be a valid URL"),
    curatedHintLevel1: optionalTrimmed("curatedHintLevel1 must be trimmed and non-empty"),
    curatedHintLevel2: optionalTrimmed("curatedHintLevel2 must be trimmed and non-empty"),
    curatedHintLevel3: optionalTrimmed("curatedHintLevel3 must be trimmed and non-empty")
  })
  .superRefine((problem, ctx) => {
    if (problem.answerFormat === "MULTIPLE_CHOICE") {
      if (!problem.answer || !/^[A-E]$/.test(problem.answer)) {
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
    } else if (problem.answerFormat === "INTEGER") {
      if (problem.choices !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "For INTEGER, choices must be absent."
        });
      }
      if (!problem.answer || !normalizedIntegerPattern.test(problem.answer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answer"],
          message:
            "For INTEGER, answer must be a normalized integer string (e.g. \"42\", \"-3\", \"0\")."
        });
      }
    } else if (problem.answerFormat === "EXPRESSION") {
      if (problem.choices !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "For EXPRESSION, choices must be absent."
        });
      }
      if (!problem.answer || problem.answer.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answer"],
          message: "For EXPRESSION, answer is required."
        });
      }
    } else if (problem.answerFormat === "PROOF") {
      if (problem.choices !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "For PROOF, choices must be absent."
        });
      }
      if (problem.answer && problem.answer.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answer"],
          message:
            "For PROOF, answer must be absent — use solutionSketch to describe the intended proof."
        });
      }
      if (!problem.solutionSketch || problem.solutionSketch.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["solutionSketch"],
          message:
            "For PROOF, solutionSketch is required — it grounds the milestone checklist generator."
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

const teacherProblemSetMetaSchema = z.object({
  title: trimmed(1, "set.title is required"),
  description: optionalTrimmed("set.description must be trimmed and non-empty"),
  contest: z.enum(TEACHER_CONTESTS).optional(),
  year: z
    .number()
    .int("year must be an integer")
    .min(1950, "year must be >= 1950")
    .max(currentYear + 1, `year must be <= ${currentYear + 1}`)
    .optional(),
  // Free-form per-teacher slug. If omitted we derive one from title so that
  // re-uploading the same file is idempotent but two different uploads in
  // the same year don't collide on (contest, year, exam).
  exam: optionalTrimmed("set.exam must be trimmed and non-empty"),
  topicKey: optionalTrimmed("set.topicKey must be trimmed and non-empty"),
  category: z.enum(TEACHER_PROBLEM_SET_CATEGORIES).optional(),
  submissionMode: z.enum(TEACHER_PROBLEM_SET_SUBMISSION_MODES).optional(),
  // Teacher sets default to tutor-enabled so students can get AI-graded
  // feedback. Teachers can turn it off if they want graded-only behavior.
  tutorEnabled: z.boolean().optional(),
  sourceUrl: optionalUrl("set.sourceUrl must be a valid URL")
});

export const teacherProblemSetSchema = z
  .object({
    // Schema version lets us evolve the contract later without silently
    // accepting stale uploads. Teachers just copy this literal from the
    // template; we bump it (v2, v3, ...) when the shape changes.
    schemaVersion: z.literal(SCHEMA_VERSION, {
      errorMap: () => ({
        message: `schemaVersion must be exactly "${SCHEMA_VERSION}"`
      })
    }),
    set: teacherProblemSetMetaSchema,
    problems: z.array(teacherProblemSchema).min(1, "At least one problem is required")
  })
  .superRefine((payload, ctx) => {
    const seenNumbers = new Set<number>();
    for (const problem of payload.problems) {
      if (seenNumbers.has(problem.number)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["problems"],
          message: `Duplicate problem number: ${problem.number}`
        });
      }
      seenNumbers.add(problem.number);
    }

    // Require contiguous 1..N numbering so the student UI can render them
    // in order without a second "map number to slot" pass. Teachers who
    // want to skip numbers can still use sourceLabel for display.
    const sortedNumbers = [...payload.problems.map((p) => p.number)].sort((a, b) => a - b);
    for (let i = 0; i < sortedNumbers.length; i += 1) {
      if (sortedNumbers[i] !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["problems"],
          message: `Problems must be numbered contiguously from 1 to ${payload.problems.length}.`
        });
        break;
      }
    }
  })
  .transform((payload) => {
    // Apply defaults. This is where the teacher-friendliness lives: the
    // teacher writes the minimum (title + problems) and we fill the rest.
    const contest = payload.set.contest ?? "PRACTICE";
    const year = payload.set.year ?? new Date().getFullYear();
    const exam = payload.set.exam ?? slugifyForExam(payload.set.title);
    const category = payload.set.category ?? "TOPIC_PRACTICE";
    const submissionMode = payload.set.submissionMode ?? "PER_PROBLEM";
    const tutorEnabled = payload.set.tutorEnabled ?? true;
    return {
      schemaVersion: payload.schemaVersion,
      set: {
        ...payload.set,
        contest,
        year,
        exam,
        category,
        submissionMode,
        tutorEnabled
      },
      problems: payload.problems
    };
  });

export type TeacherProblemSetInput = z.infer<typeof teacherProblemSetSchema>;
export type TeacherProblemInput = TeacherProblemSetInput["problems"][number];

/**
 * Light probe: is this JSON shaped like a teacher-format payload?
 *
 * The admin-import tRPC route accepts BOTH the contest format (AMC/AIME
 * bulk import) and the teacher format (homework/practice). We need a cheap,
 * structural way to decide which validator to use before we report full
 * validation errors — otherwise a valid teacher-format file would get
 * slapped with "contest must be one of AMC8, ..." errors that are very
 * confusing.
 *
 * `looksLikeTeacherFormat` does NOT validate — it just routes.
 */
export function looksLikeTeacherFormat(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (obj.schemaVersion === SCHEMA_VERSION) return true;
  // Also accept `set: {...}` with no `problemSet`, since the distinguishing
  // shape is top-level `set` vs `problemSet`.
  if (
    obj.set &&
    typeof obj.set === "object" &&
    obj.problemSet === undefined
  ) {
    return true;
  }
  return false;
}
