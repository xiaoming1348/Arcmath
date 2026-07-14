import { z } from "zod";
import { callOpenAIJson } from "@/lib/ai/openai-json";

export const materialAssignmentDraftInputSchema = z.object({
  language: z.enum(["en", "zh"]),
  resourceTitle: z.string().trim().min(1).max(200),
  teacherInstructions: z.string().trim().max(4000).optional(),
  sourcePageStart: z.number().int().positive().optional(),
  sourcePageEnd: z.number().int().positive().optional(),
  sourceProblemStart: z.string().trim().max(40).optional(),
  sourceProblemEnd: z.string().trim().max(40).optional(),
  sourceExcerpt: z.string().trim().min(20).max(12000)
});

export const materialAssignmentDraftOutputSchema = z.object({
  title: z.string().min(1).max(200),
  studentPrompt: z.string().min(1).max(5000),
  gradingGuidance: z.string().min(1).max(5000)
});

export const materialAssignmentDraftOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "studentPrompt", "gradingGuidance"],
  properties: {
    title: {
      type: "string",
      description:
        "Concise assignment title based on the selected resource pages/problems."
    },
    studentPrompt: {
      type: "string",
      description:
        "Clean student-facing assignment prompt. Preserve the original math intent, remove OCR/PDF noise, state answer expectations, and do not include solutions."
    },
    gradingGuidance: {
      type: "string",
      description:
        "Teacher-only manual grading guidance: rubric criteria, what to look for, and common partial-credit issues. Do not give a final-answer key."
    }
  }
} as const;

export type MaterialAssignmentDraftInput = z.infer<
  typeof materialAssignmentDraftInputSchema
>;
export type MaterialAssignmentDraft = z.infer<
  typeof materialAssignmentDraftOutputSchema
> & {
  source: "ai" | "fallback";
  generatedAt: string;
};

function scopeLine(input: MaterialAssignmentDraftInput): string {
  const pageScope =
    input.sourcePageStart && input.sourcePageEnd
      ? `pages ${input.sourcePageStart}-${input.sourcePageEnd}`
      : input.sourcePageStart
        ? `page ${input.sourcePageStart}`
        : "";
  const problemScope =
    input.sourceProblemStart && input.sourceProblemEnd
      ? `problems ${input.sourceProblemStart}-${input.sourceProblemEnd}`
      : input.sourceProblemStart
        ? `problem ${input.sourceProblemStart}`
        : "";
  return [pageScope, problemScope].filter(Boolean).join(", ");
}

function buildPrompt(input: MaterialAssignmentDraftInput): string {
  const lang =
    input.language === "zh"
      ? "Write student-facing text and grading guidance in Simplified Chinese unless the source problem itself must remain in English."
      : "Write student-facing text and grading guidance in English.";
  const scope = scopeLine(input);

  return [
    "You are ArcMath's school-platform assignment formatter.",
    "A teacher selected part of a larger PDF/book and pasted the relevant source excerpt.",
    "",
    "Your job:",
    "- Transform the selected source into a clean assignment prompt students can submit against.",
    "- If selected problem numbers are provided and the source excerpt includes surrounding problems, include ONLY the requested problem range.",
    "- Preserve the original problem meaning and all math constraints.",
    "- Remove OCR noise, page headers/footers, numbering clutter, and irrelevant surrounding text.",
    "- Include page/problem references when useful.",
    "- Produce teacher-only grading guidance for manual grading.",
    "",
    "Hard rules:",
    "- Do not solve the problems.",
    "- Do not include final answers, answer keys, explicit solution matrices, numeric results, or theorem conclusions.",
    "- In grading guidance, describe what to check conceptually; never state the correct answer.",
    "- If the selected source has possible OCR/dimension ambiguity, flag the ambiguity instead of guessing the intended answer.",
    "- If a statement is ambiguous, keep the ambiguity visible and note it in grading guidance.",
    "- Keep the prompt concise enough for a student assignment card.",
    lang,
    "",
    `Resource title: ${input.resourceTitle}`,
    scope ? `Selected scope: ${scope}` : null,
    input.teacherInstructions
      ? `Teacher instructions already provided: ${input.teacherInstructions}`
      : null,
    "",
    "Selected source excerpt:",
    input.sourceExcerpt
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}

function fallbackDraft(input: MaterialAssignmentDraftInput): MaterialAssignmentDraft {
  const scope = scopeLine(input);
  const zh = input.language === "zh";
  const titleBase = scope ? `${input.resourceTitle}: ${scope}` : input.resourceTitle;

  return {
    source: "fallback",
    generatedAt: new Date().toISOString(),
    title: titleBase.slice(0, 200),
    studentPrompt: zh
      ? [
          scope ? `请完成 ${scope}。` : "请完成老师指定的材料选段。",
          input.teacherInstructions ?? "",
          "",
          "题目文本：",
          input.sourceExcerpt
        ]
          .filter((part) => part.trim().length > 0)
          .join("\n")
          .slice(0, 5000)
      : [
          scope ? `Complete ${scope}.` : "Complete the selected material excerpt.",
          input.teacherInstructions ?? "",
          "",
          "Problem text:",
          input.sourceExcerpt
        ]
          .filter((part) => part.trim().length > 0)
          .join("\n")
          .slice(0, 5000),
    gradingGuidance: zh
      ? "根据学生是否准确理解题意、写出关键步骤、说明理由并完成指定题号进行评分。若原始文本存在歧义，请优先检查学生是否清楚说明自己的假设。"
      : "Grade for accurate interpretation, complete work for the selected problems, clear reasoning, and justified steps. If the source excerpt is ambiguous, prioritize whether the student stated reasonable assumptions."
  };
}

export async function generateMaterialAssignmentDraft(
  input: MaterialAssignmentDraftInput
): Promise<MaterialAssignmentDraft> {
  const result = await callOpenAIJson({
    scope: "material-assignment-draft",
    schemaName: "material_assignment_draft",
    prompt: buildPrompt(input),
    schema: materialAssignmentDraftOutputSchema,
    jsonSchema: materialAssignmentDraftOutputJsonSchema,
    maxOutputTokens: 1200
  });

  if (!result) {
    return fallbackDraft(input);
  }

  return {
    ...result,
    source: "ai",
    generatedAt: new Date().toISOString()
  };
}
