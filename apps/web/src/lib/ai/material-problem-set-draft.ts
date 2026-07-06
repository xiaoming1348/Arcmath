import { z } from "zod";
import { SCHEMA_VERSION, slugifyForExam } from "@arcmath/shared";
import { callOpenAIJson } from "@/lib/ai/openai-json";
import { materialAssignmentDraftInputSchema } from "@/lib/ai/material-assignment-draft";

const draftedProblemSchema = z.object({
  originalNumber: z.string().trim().max(40).nullable(),
  statement: z.string().trim().min(1).max(3500),
  answerFormat: z
    .enum(["MULTIPLE_CHOICE", "INTEGER", "EXPRESSION", "PROOF"])
    .nullable(),
  choices: z.array(z.string().trim().min(1).max(800)).max(8).nullable(),
  topicKey: z.string().trim().min(1).max(80).nullable(),
  techniqueTags: z.array(z.string().trim().min(1).max(40)).max(8),
  difficultyBand: z.enum(["EASY", "MEDIUM", "HARD"]).nullable(),
  reviewNotes: z.string().trim().min(1).max(500).nullable()
});

const materialProblemSetDraftAiSchema = z.object({
  title: z.string().trim().min(1).max(200),
  problems: z.array(draftedProblemSchema).min(1).max(50),
  warnings: z.array(z.string().trim().min(1).max(300)).max(10)
});

const MATERIAL_PROBLEM_SET_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "problems", "warnings"],
  properties: {
    title: { type: "string" },
    problems: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "originalNumber",
          "statement",
          "answerFormat",
          "choices",
          "topicKey",
          "techniqueTags",
          "difficultyBand",
          "reviewNotes"
        ],
        properties: {
          originalNumber: { type: ["string", "null"] },
          statement: { type: "string" },
          answerFormat: {
            type: ["string", "null"],
            enum: ["MULTIPLE_CHOICE", "INTEGER", "EXPRESSION", "PROOF", null]
          },
          choices: {
            type: ["array", "null"],
            items: { type: "string" },
            maxItems: 8
          },
          topicKey: { type: ["string", "null"] },
          techniqueTags: {
            type: "array",
            items: { type: "string" },
            maxItems: 8
          },
          difficultyBand: {
            type: ["string", "null"],
            enum: ["EASY", "MEDIUM", "HARD", null]
          },
          reviewNotes: { type: ["string", "null"] }
        }
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      maxItems: 10
    }
  }
} as const;

export const materialProblemSetDraftInputSchema =
  materialAssignmentDraftInputSchema.extend({
    sourceUrl: z.string().url().optional()
  });

export type MaterialProblemSetDraftInput = z.infer<
  typeof materialProblemSetDraftInputSchema
>;

export type MaterialProblemSetDraft = {
  jsonText: string;
  title: string;
  problemCount: number;
  warnings: string[];
  source: "ai" | "fallback";
  generatedAt: string;
};

function scopeLine(input: MaterialProblemSetDraftInput): string {
  const pageScope =
    input.sourcePageStart && input.sourcePageEnd
      ? input.sourcePageStart === input.sourcePageEnd
        ? `page ${input.sourcePageStart}`
        : `pages ${input.sourcePageStart}-${input.sourcePageEnd}`
      : input.sourcePageStart
        ? `page ${input.sourcePageStart}`
        : "";
  const problemScope =
    input.sourceProblemStart && input.sourceProblemEnd
      ? input.sourceProblemStart === input.sourceProblemEnd
        ? `problem ${input.sourceProblemStart}`
        : `problems ${input.sourceProblemStart}-${input.sourceProblemEnd}`
      : input.sourceProblemStart
        ? `problem ${input.sourceProblemStart}`
        : "";
  return [pageScope, problemScope].filter(Boolean).join(", ");
}

function sourceLabel(input: MaterialProblemSetDraftInput, originalNumber: string | null): string {
  return [
    input.resourceTitle,
    scopeLine(input),
    originalNumber ? `source problem ${originalNumber}` : null
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ")
    .slice(0, 200);
}

function buildPrompt(input: MaterialProblemSetDraftInput): string {
  const lang =
    input.language === "zh"
      ? "Use Simplified Chinese for review notes. Keep source problem statements in their original language unless they are clearly OCR noise."
      : "Use English for review notes. Keep source problem statements in their original language unless they are clearly OCR noise.";
  const scope = scopeLine(input);

  return [
    "You are ArcMath's teacher material-to-problem-set formatter.",
    "A teacher selected part of a larger PDF/book and wants a REVIEWABLE structured draft for ArcMath's teacher-v1 import format.",
    "",
    "Your job:",
    "- Extract the selected problems as separate clean statements.",
    "- Include ONLY the requested problem range when page text contains surrounding problems.",
    "- Preserve original mathematical meaning, constraints, subparts, choices, diagrams/table references, and notation.",
    "- Remove OCR artifacts, page headers, footers, duplicate page numbers, and unrelated book text.",
    "- Identify the likely answer format, but do not provide answers.",
    "",
    "Hard rules:",
    "- Do not solve the problems.",
    "- Do not invent answer keys, final answers, solution sketches, or missing diagrams.",
    "- If a diagram is necessary, put a bracketed note inside the statement, e.g. [diagram from source PDF required].",
    "- If the selected text is ambiguous, keep the ambiguity in the statement and put a short warning in reviewNotes.",
    "- The teacher will edit and preview the JSON before committing. The draft may intentionally need answer/solutionSketch fields before it validates.",
    lang,
    "",
    `Resource title: ${input.resourceTitle}`,
    scope ? `Selected scope: ${scope}` : null,
    input.teacherInstructions
      ? `Teacher instructions: ${input.teacherInstructions}`
      : null,
    "",
    "Selected source excerpt:",
    input.sourceExcerpt
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}

function buildTeacherJson(
  input: MaterialProblemSetDraftInput,
  draft: z.infer<typeof materialProblemSetDraftAiSchema>
): string {
  const currentYear = new Date().getFullYear();
  const scope = scopeLine(input);
  const setTitle = draft.title || (scope ? `${input.resourceTitle}: ${scope}` : input.resourceTitle);
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    set: {
      title: setTitle.slice(0, 200),
      description:
        "Drafted from selected PDF material. Teacher must review statements and add required answers or solution sketches before committing.",
      contest: "PRACTICE",
      year: currentYear,
      exam: slugifyForExam(`${input.resourceTitle}-${scope || "selection"}`),
      category: "TOPIC_PRACTICE",
      submissionMode: "PER_PROBLEM",
      tutorEnabled: false,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {})
    },
    problems: draft.problems.map((problem, index) => {
      const answerFormat = problem.answerFormat ?? "PROOF";
      return {
        number: index + 1,
        statement: problem.statement,
        statementFormat: "MARKDOWN_LATEX",
        answerFormat,
        ...(answerFormat === "MULTIPLE_CHOICE" &&
        problem.choices &&
        problem.choices.length > 0
          ? { choices: problem.choices.slice(0, 5) }
          : {}),
        ...(problem.topicKey ? { topicKey: problem.topicKey } : {}),
        ...(problem.techniqueTags.length > 0
          ? { techniqueTags: problem.techniqueTags }
          : {}),
        ...(problem.difficultyBand ? { difficultyBand: problem.difficultyBand } : {}),
        sourceLabel: sourceLabel(input, problem.originalNumber),
        ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {})
      };
    })
  };

  return JSON.stringify(payload, null, 2);
}

function fallbackDraft(input: MaterialProblemSetDraftInput): MaterialProblemSetDraft {
  const scope = scopeLine(input);
  const title = scope ? `${input.resourceTitle}: ${scope}` : input.resourceTitle;
  const fallbackAiShape: z.infer<typeof materialProblemSetDraftAiSchema> = {
    title,
    problems: [
      {
        originalNumber: input.sourceProblemStart ?? null,
        statement: input.sourceExcerpt.slice(0, 3500),
        answerFormat: "PROOF",
        choices: null,
        topicKey: null,
        techniqueTags: [],
        difficultyBand: null,
        reviewNotes:
          "AI formatting was unavailable. Review the statement and add answers or a solution sketch before committing."
      }
    ],
    warnings: ["AI structured formatting was unavailable; generated a one-problem review draft from the selected excerpt."]
  };

  return {
    jsonText: buildTeacherJson(input, fallbackAiShape),
    title,
    problemCount: 1,
    warnings: [
      ...fallbackAiShape.warnings,
      "Teacher review required: add answer fields for objective problems or solutionSketch for proof problems before committing."
    ],
    source: "fallback",
    generatedAt: new Date().toISOString()
  };
}

export async function generateMaterialProblemSetDraft(
  input: MaterialProblemSetDraftInput
): Promise<MaterialProblemSetDraft> {
  const result = await callOpenAIJson({
    scope: "material-problem-set-draft",
    schemaName: "material_problem_set_draft",
    prompt: buildPrompt(input),
    schema: materialProblemSetDraftAiSchema,
    jsonSchema: MATERIAL_PROBLEM_SET_DRAFT_JSON_SCHEMA,
    maxOutputTokens: 1800
  });

  if (!result) {
    return fallbackDraft(input);
  }

  const reviewWarnings = [
    ...result.warnings,
    "Teacher review required: this draft intentionally omits answers and solution sketches so ArcMath does not invent grading keys.",
    "Use Preview before Commit. The importer will block commit until every problem has the required answer or solutionSketch fields."
  ];

  return {
    jsonText: buildTeacherJson(input, result),
    title: result.title,
    problemCount: result.problems.length,
    warnings: reviewWarnings,
    source: "ai",
    generatedAt: new Date().toISOString()
  };
}
