import { z } from "zod";
import { callOpenAIJson } from "@/lib/ai/openai-json";

export const teacherPrepModeSchema = z.enum([
  "DIFFICULT_PROBLEM",
  "CHAPTER_PREVIEW",
  "WORKSHEET_MATERIAL"
]);

export const teacherPrepLanguageSchema = z.enum(["en", "zh"]);

export const teacherPrepInputSchema = z.object({
  mode: teacherPrepModeSchema,
  language: teacherPrepLanguageSchema,
  sourceText: z.string().trim().min(20).max(12000),
  courseLevel: z.string().trim().max(120).optional(),
  contestTrack: z.string().trim().max(120).optional(),
  teacherNotes: z.string().trim().max(2000).optional()
});

const nonEmptyList = z
  .array(z.string().min(1).max(360))
  .min(2)
  .max(8);

export const teacherPrepOutputSchema = z.object({
  briefTitle: z.string().min(1).max(140),
  summary: z.string().min(1).max(1000),
  keyIdeas: nonEmptyList,
  prerequisites: nonEmptyList,
  commonMisconceptions: nonEmptyList,
  teachingSequence: nonEmptyList,
  discussionQuestions: nonEmptyList,
  practiceFocus: nonEmptyList,
  answerPolicyReminder: z.string().min(1).max(500)
});

export const teacherPrepOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "briefTitle",
    "summary",
    "keyIdeas",
    "prerequisites",
    "commonMisconceptions",
    "teachingSequence",
    "discussionQuestions",
    "practiceFocus",
    "answerPolicyReminder"
  ],
  properties: {
    briefTitle: {
      type: "string",
      description: "A concise title for the teacher preparation brief."
    },
    summary: {
      type: "string",
      description:
        "A concise classroom-facing summary of what the teacher should understand before teaching this material."
    },
    keyIdeas: {
      type: "array",
      items: { type: "string" },
      description:
        "Core mathematical ideas, pivots, or structure teachers should emphasize."
    },
    prerequisites: {
      type: "array",
      items: { type: "string" },
      description:
        "Prerequisite concepts or skills students need before this lesson or problem."
    },
    commonMisconceptions: {
      type: "array",
      items: { type: "string" },
      description:
        "Likely student mistakes, false starts, or conceptual traps."
    },
    teachingSequence: {
      type: "array",
      items: { type: "string" },
      description:
        "Suggested sequence of teacher moves, mini-checks, or explanation steps."
    },
    discussionQuestions: {
      type: "array",
      items: { type: "string" },
      description:
        "Questions the teacher can ask students to surface reasoning without giving away the answer."
    },
    practiceFocus: {
      type: "array",
      items: { type: "string" },
      description:
        "Follow-up practice focuses or skill drills aligned with the material."
    },
    answerPolicyReminder: {
      type: "string",
      description:
        "A short reminder that this brief is for teacher preparation, not direct answer delivery."
    }
  }
} as const;

export type TeacherPrepInput = z.infer<typeof teacherPrepInputSchema>;
export type TeacherPrepBrief = z.infer<typeof teacherPrepOutputSchema> & {
  source: "ai" | "fallback";
  generatedAt: string;
};

function modeLabel(mode: TeacherPrepInput["mode"]): string {
  switch (mode) {
    case "DIFFICULT_PROBLEM":
      return "difficult problem";
    case "CHAPTER_PREVIEW":
      return "chapter preview";
    case "WORKSHEET_MATERIAL":
      return "worksheet or material";
  }
}

function languageInstruction(language: TeacherPrepInput["language"]): string {
  return language === "zh"
    ? "Respond in concise Simplified Chinese for a professional math teacher audience."
    : "Respond in concise English for a professional math teacher audience.";
}

function buildPrompt(input: TeacherPrepInput): string {
  const contextLines = [
    input.courseLevel ? `Course/level: ${input.courseLevel}` : null,
    input.contestTrack ? `Track/exam: ${input.contestTrack}` : null,
    input.teacherNotes ? `Teacher notes: ${input.teacherNotes}` : null
  ].filter(Boolean);

  return [
    "You are ArcMath's teacher preparation assistant for international schools and tutoring organizations.",
    `Task mode: ${modeLabel(input.mode)}.`,
    languageInstruction(input.language),
    "",
    "Important rules:",
    "- This is for teacher preparation only.",
    "- Do not produce a final-answer-only response.",
    "- For a difficult problem, explain the strategy, key pivots, and likely student traps, but do not write a polished full solution or final-answer dump.",
    "- For a chapter preview, map the concepts and teaching order instead of generating homework answers.",
    "- Keep the writing compact, concrete, and ready for classroom use.",
    "- Base the brief only on the provided material and context.",
    "",
    contextLines.length > 0 ? "Context:" : null,
    ...contextLines,
    "",
    "Source material:",
    input.sourceText
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}

function fallbackBrief(input: TeacherPrepInput): TeacherPrepBrief {
  const zh = input.language === "zh";
  const generatedAt = new Date().toISOString();

  if (zh) {
    return {
      source: "fallback",
      generatedAt,
      briefTitle:
        input.mode === "CHAPTER_PREVIEW"
          ? "章节预习备课简报"
          : input.mode === "WORKSHEET_MATERIAL"
            ? "材料备课简报"
            : "难题分析备课简报",
      summary:
        "AI 服务暂时不可用，因此这里提供本地备课框架。建议先识别材料中的核心概念、学生最可能卡住的位置，以及课堂上需要追问的关键问题。",
      keyIdeas: [
        "先提炼题目或章节中的核心对象、条件和目标。",
        "找出从已知条件走向关键结论的主要桥梁。",
        "把复杂推理拆成学生可以检查的短步骤。"
      ],
      prerequisites: [
        "确认学生是否掌握相关定义、基本定理和常用转化。",
        "准备一个低门槛例子，用来检测课前基础。",
        "提前标出需要复习的符号、图形或代数技巧。"
      ],
      commonMisconceptions: [
        "学生可能只套公式而忽略适用条件。",
        "学生可能把结论当作条件使用。",
        "学生可能在关键转化前缺少中间理由。"
      ],
      teachingSequence: [
        "先让学生复述目标和已知条件。",
        "再讨论可以尝试的入口和不能直接使用的方法。",
        "最后总结关键思想，并安排相似但不重复的练习。"
      ],
      discussionQuestions: [
        "这个问题真正要我们证明或找到什么？",
        "哪些条件看起来最有信息量？为什么？",
        "如果换一种表示方式，结构会不会更清楚？"
      ],
      practiceFocus: [
        "练习识别同类结构，而不是记忆单题答案。",
        "安排一题基础迁移和一题变式挑战。",
        "要求学生写出关键步骤的理由。"
      ],
      answerPolicyReminder:
        "此简报用于教师备课和课堂引导，不应直接作为学生答案发布。"
    };
  }

  return {
    source: "fallback",
    generatedAt,
    briefTitle:
      input.mode === "CHAPTER_PREVIEW"
        ? "Chapter Preview Prep Brief"
        : input.mode === "WORKSHEET_MATERIAL"
          ? "Material Prep Brief"
          : "Difficult Problem Prep Brief",
    summary:
      "The AI service is unavailable, so this local brief gives a dependable prep structure. Identify the core concept, the likely student sticking points, and the questions that expose reasoning before showing any complete solution.",
    keyIdeas: [
      "Separate the given information, the target, and the hidden structure.",
      "Name the main bridge from known facts to the key conclusion.",
      "Break the reasoning into short checkpoints students can verify."
    ],
    prerequisites: [
      "Check the definitions, standard facts, and transformations needed here.",
      "Prepare a low-entry example to test readiness.",
      "Mark any notation, diagram feature, or algebraic move that needs review."
    ],
    commonMisconceptions: [
      "Students may apply a formula without checking its conditions.",
      "Students may use the desired conclusion as if it were already known.",
      "Students may skip the transition where the key idea enters."
    ],
    teachingSequence: [
      "Ask students to restate the target and the strongest given information.",
      "Compare plausible entry points and rule out unproductive direct attacks.",
      "Summarize the key idea, then assign one near-transfer and one variation."
    ],
    discussionQuestions: [
      "What is the problem really asking us to prove or find?",
      "Which condition carries the most information, and why?",
      "Would a different representation make the structure more visible?"
    ],
    practiceFocus: [
      "Practice recognizing the same structure in changed surface forms.",
      "Use one foundational transfer problem and one harder variation.",
      "Require written justification for the pivotal step."
    ],
    answerPolicyReminder:
      "This brief is for teacher preparation and classroom guidance, not for publishing direct student answers."
  };
}

export async function generateTeacherPrepBrief(
  input: TeacherPrepInput
): Promise<TeacherPrepBrief> {
  const result = await callOpenAIJson({
    scope: "teacher-prep",
    schemaName: "teacher_prep_brief",
    prompt: buildPrompt(input),
    schema: teacherPrepOutputSchema,
    jsonSchema: teacherPrepOutputJsonSchema,
    maxOutputTokens: 1100
  });

  if (!result) {
    return fallbackBrief(input);
  }

  return {
    ...result,
    source: "ai",
    generatedAt: new Date().toISOString()
  };
}
