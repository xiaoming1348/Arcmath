import { z } from "zod";
import { callOpenAIJson } from "@/lib/ai/openai-json";

const HINT_FALLBACKS = {
  1: "Think about the key concept.",
  2: "Try setting up the equation.",
  3: "Focus on the key transformation."
} as const;

export const HINT_TUTOR_PROMPT_VERSION = "hint-tutor-v1";

export type HintTutorAnswerFormat = "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";
export type InteractiveTutorIntent = "HELP_START" | "CHECK_STEP" | "CHECK_ANSWER_IDEA" | "SMALLER_HINT";

export type GenerateHintParams = {
  problemStatement: string;
  answerFormat: HintTutorAnswerFormat;
  choices?: unknown;
  diagramImageAlt?: string | null;
  draftAnswer?: string;
  hintLevel: number;
  solutionSketch?: string | null;
};

export type GenerateExplanationParams = {
  problemStatement: string;
  answerFormat: HintTutorAnswerFormat;
  choices?: unknown;
  diagramImageAlt?: string | null;
  submittedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  solutionSketch?: string | null;
};

export type HintModelOutput = {
  hintText: string;
  checkQuestion: string;
};

export type ExplanationModelOutput = {
  explanation: string;
};

export type GenerateInteractiveTutorResponseParams = {
  problemStatement: string;
  answerFormat: HintTutorAnswerFormat;
  choices?: unknown;
  diagramImageAlt?: string | null;
  studentMessage?: string;
  draftAnswer?: string;
  hintLevel: number;
  intent: InteractiveTutorIntent;
  recentTurns: Array<{
    actor: "STUDENT" | "TUTOR" | "SYSTEM";
    text: string;
  }>;
  solutionSketch?: string | null;
};

export type InteractiveTutorModelOutput = {
  tutorText: string;
  nextSuggestedIntent: InteractiveTutorIntent;
};

const hintOutputSchema = z.object({
  hintText: z.string().min(1),
  checkQuestion: z.string().min(1)
});

const explanationOutputSchema = z.object({
  explanation: z.string().min(1)
});

const interactiveTutorOutputSchema = z.object({
  tutorText: z.string().min(1),
  nextSuggestedIntent: z.enum(["HELP_START", "CHECK_STEP", "CHECK_ANSWER_IDEA", "SMALLER_HINT"])
});

const hintOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hintText: { type: "string" },
    checkQuestion: { type: "string" }
  },
  required: ["hintText", "checkQuestion"]
} as const;

const explanationOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    explanation: { type: "string" }
  },
  required: ["explanation"]
} as const;

const interactiveTutorOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    tutorText: { type: "string" },
    nextSuggestedIntent: {
      type: "string",
      enum: ["HELP_START", "CHECK_STEP", "CHECK_ANSWER_IDEA", "SMALLER_HINT"]
    }
  },
  required: ["tutorText", "nextSuggestedIntent"]
} as const;

function normalizeChoices(choices: unknown): string[] {
  if (!Array.isArray(choices)) {
    return [];
  }

  return choices
    .map((choice) => {
      if (typeof choice === "string") {
        return choice.trim();
      }

      if (choice === null || choice === undefined) {
        return "";
      }

      return String(choice).trim();
    })
    .filter((choice) => choice.length > 0);
}

function clampHintLevel(level: number): 1 | 2 | 3 {
  if (level <= 1) {
    return 1;
  }
  if (level >= 3) {
    return 3;
  }
  return 2;
}

export function buildHintPrompt(params: GenerateHintParams): string {
  const choices = normalizeChoices(params.choices);
  const draftAnswer = params.draftAnswer?.trim() || "(none)";
  const diagramDescription = params.diagramImageAlt?.trim() || "(none)";
  const solutionSketch = params.solutionSketch?.trim() || "(none)";
  const choiceBlock =
    choices.length > 0 ? `Choices:\n${choices.map((choice, index) => `${String.fromCharCode(65 + index)}. ${choice}`).join("\n")}` : "Choices:\n(none)";

  return [
    "You are an AI math tutor generating one progressive hint.",
    "Rules:",
    "- Return valid JSON only.",
    "- Do not reveal the final answer.",
    "- Use the solution sketch as hidden teacher context when present, but never quote it directly or reveal the final answer.",
    "- Level 1: gentle direction.",
    "- Level 2: setup or intermediate step.",
    "- Level 3: strong guidance without final answer.",
    '- Output schema: {"hintText":"string","checkQuestion":"string"}',
    `Answer format: ${params.answerFormat}`,
    `Hint level: ${clampHintLevel(params.hintLevel)}`,
    `Student draft answer: ${draftAnswer}`,
    `Problem:\n${params.problemStatement}`,
    choiceBlock,
    `Diagram description:\n${diagramDescription}`,
    `Hidden solution sketch:\n${solutionSketch}`
  ].join("\n");
}

export function buildExplanationPrompt(params: GenerateExplanationParams): string {
  const choices = normalizeChoices(params.choices);
  const diagramDescription = params.diagramImageAlt?.trim() || "(none)";
  const solutionSketch = params.solutionSketch?.trim() || "(none)";
  const choiceBlock =
    choices.length > 0 ? `Choices:\n${choices.map((choice, index) => `${String.fromCharCode(65 + index)}. ${choice}`).join("\n")}` : "Choices:\n(none)";

  return [
    "You are an AI math tutor explaining a student's submitted answer.",
    "Rules:",
    "- Return valid JSON only.",
    "- Reference the student's submitted answer directly.",
    "- If incorrect, explain the likely mistake briefly.",
    "- Use the solution sketch as hidden teacher context when present, but keep the explanation concise and student-facing.",
    '- Output schema: {"explanation":"string"}',
    `Answer format: ${params.answerFormat}`,
    `Is correct: ${params.isCorrect ? "yes" : "no"}`,
    `Student answer: ${params.submittedAnswer}`,
    `Expected answer: ${params.correctAnswer}`,
    `Problem:\n${params.problemStatement}`,
    choiceBlock,
    `Diagram description:\n${diagramDescription}`,
    `Hidden solution sketch:\n${solutionSketch}`
  ].join("\n");
}

function formatRecentTurns(
  turns: GenerateInteractiveTutorResponseParams["recentTurns"]
): string {
  if (turns.length === 0) {
    return "(none)";
  }

  return turns
    .map((turn) => `${turn.actor}: ${turn.text.trim() || "(empty)"}`)
    .join("\n");
}

export function buildInteractiveTutorPrompt(params: GenerateInteractiveTutorResponseParams): string {
  const choices = normalizeChoices(params.choices);
  const diagramDescription = params.diagramImageAlt?.trim() || "(none)";
  const solutionSketch = params.solutionSketch?.trim() || "(none)";
  const studentMessage = params.studentMessage?.trim() || "(none)";
  const draftAnswer = params.draftAnswer?.trim() || "(none)";
  const choiceBlock =
    choices.length > 0 ? `Choices:\n${choices.map((choice, index) => `${String.fromCharCode(65 + index)}. ${choice}`).join("\n")}` : "Choices:\n(none)";

  return [
    "You are an interactive AI math tutor in a multi-turn tutoring session.",
    "Rules:",
    "- Return valid JSON only.",
    "- Do not reveal the final answer.",
    "- Advance the student by one meaningful step only.",
    "- If the student is checking a step, directly assess that step before giving the next move.",
    "- If the student is checking an answer idea, do not simply confirm the final answer; ask for or test the reasoning.",
    "- End with one concrete next action or one short check question.",
    "- Use the solution sketch as hidden teacher context when present, but never quote it directly or reveal the final answer.",
    '- Output schema: {"tutorText":"string","nextSuggestedIntent":"HELP_START|CHECK_STEP|CHECK_ANSWER_IDEA|SMALLER_HINT"}',
    `Answer format: ${params.answerFormat}`,
    `Intent: ${params.intent}`,
    `Current hint level: ${clampHintLevel(params.hintLevel)}`,
    `Student message: ${studentMessage}`,
    `Student draft answer: ${draftAnswer}`,
    `Problem:\n${params.problemStatement}`,
    choiceBlock,
    `Diagram description:\n${diagramDescription}`,
    `Recent turns:\n${formatRecentTurns(params.recentTurns)}`,
    `Hidden solution sketch:\n${solutionSketch}`
  ].join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMultipleChoiceLeakPatterns(answerLabel: string): RegExp[] {
  const escapedLabel = escapeRegExp(answerLabel);

  return [
    new RegExp(
      String.raw`\b(?:the\s+)?(?:final\s+)?(?:correct\s+)?answer\s*(?:is|=|:)\s*(?:option|choice)?\s*\(?${escapedLabel}\)?\b`,
      "i"
    ),
    new RegExp(
      String.raw`\b(?:the\s+)?(?:correct\s+)?(?:option|choice)\s*(?:is|=|:)?\s*\(?${escapedLabel}\)?\b`,
      "i"
    ),
    new RegExp(
      String.raw`\b(?:choose|pick|select|go with)\s+(?:option|choice)?\s*\(?${escapedLabel}\)?\b`,
      "i"
    ),
    new RegExp(
      String.raw`\b\(?${escapedLabel}\)?\s+(?:is|looks)\s+(?:the\s+)?(?:correct|right)\s+(?:answer|option|choice)\b`,
      "i"
    )
  ];
}

export function hintLeaksFinalAnswer(hintText: string, correctAnswer?: string | null): boolean {
  const normalizedHint = hintText.trim().toLowerCase();
  const normalizedAnswer = (correctAnswer ?? "").trim().toLowerCase();

  if (!normalizedHint) {
    return false;
  }

  if (/^[a-e]$/i.test(normalizedAnswer)) {
    const leakPatterns = buildMultipleChoiceLeakPatterns(normalizedAnswer.toUpperCase());
    if (leakPatterns.some((pattern) => pattern.test(hintText))) {
      return true;
    }
  } else if (normalizedAnswer && normalizedHint.includes(normalizedAnswer)) {
    return true;
  }

  return /final answer is|answer is|choose [a-e]\b|option [a-e]\b|choice [a-e]\b/i.test(hintText);
}

export function getSafeFallbackHint(level: number): HintModelOutput {
  const safeLevel = clampHintLevel(level);

  return {
    hintText: HINT_FALLBACKS[safeLevel],
    checkQuestion: "What is the next step you can try on your own?"
  };
}

export function getSafeFallbackInteractiveTutorResponse(
  intent: InteractiveTutorIntent,
  hintLevel: number
): InteractiveTutorModelOutput {
  const safeLevel = clampHintLevel(hintLevel);

  if (intent === "CHECK_STEP") {
    return {
      tutorText:
        "Focus on whether your current step uses the right relationship from the problem. If one condition is missing, rewrite the step using that condition before you continue.",
      nextSuggestedIntent: "CHECK_STEP"
    };
  }

  if (intent === "CHECK_ANSWER_IDEA") {
    return {
      tutorText:
        "Before confirming your answer idea, check the reasoning that produced it. What equation, count, or geometric fact leads to that result?",
      nextSuggestedIntent: "CHECK_STEP"
    };
  }

  if (intent === "SMALLER_HINT") {
    return {
      tutorText:
        safeLevel === 1
          ? "Start by identifying the most important quantity or relationship in the problem."
          : "Step back one level and name the structure you need before computing anything.",
      nextSuggestedIntent: "HELP_START"
    };
  }

  return {
    tutorText:
      safeLevel === 1
        ? "Start by identifying the main relationship or quantity the problem is built around."
        : "Write down the setup carefully before trying to finish the computation.",
    nextSuggestedIntent: "CHECK_STEP"
  };
}

function getSafeFallbackExplanation(params: GenerateExplanationParams): ExplanationModelOutput {
  if (params.isCorrect) {
    return {
      explanation: `Nice work. Your answer "${params.submittedAnswer}" matches the expected result.`
    };
  }

  return {
    explanation: `Your answer "${params.submittedAnswer}" does not match the expected result. Review the key setup and final computation.`
  };
}

export async function generateHint(params: GenerateHintParams): Promise<HintModelOutput> {
  const safeLevel = clampHintLevel(params.hintLevel);
  const prompt = buildHintPrompt(params);
  const generated = await callOpenAIJson({
    scope: "hint-tutor",
    schemaName: "hint_tutor_hint",
    prompt,
    schema: hintOutputSchema,
    jsonSchema: hintOutputJsonSchema,
    maxOutputTokens: 220
  });

  if (generated) {
    return generated;
  }

  if (safeLevel === 1) {
    return {
      hintText: HINT_FALLBACKS[1],
      checkQuestion: "Which idea or theorem seems most relevant here?"
    };
  }

  if (safeLevel === 2) {
    return {
      hintText: HINT_FALLBACKS[2],
      checkQuestion: "What equation or structure captures the problem?"
    };
  }

  return {
    hintText: HINT_FALLBACKS[3],
    checkQuestion: "Which substitution, simplification, or rewrite gets you closer?"
  };
}

export async function generateExplanation(
  params: GenerateExplanationParams
): Promise<ExplanationModelOutput> {
  const prompt = buildExplanationPrompt(params);
  const generated = await callOpenAIJson({
    scope: "hint-tutor",
    schemaName: "hint_tutor_explanation",
    prompt,
    schema: explanationOutputSchema,
    jsonSchema: explanationOutputJsonSchema,
    maxOutputTokens: 220
  });

  if (generated) {
    return generated;
  }

  return getSafeFallbackExplanation(params);
}

export async function generateInteractiveTutorResponse(
  params: GenerateInteractiveTutorResponseParams
): Promise<InteractiveTutorModelOutput> {
  const prompt = buildInteractiveTutorPrompt(params);
  const generated = await callOpenAIJson({
    scope: "hint-tutor",
    schemaName: "hint_tutor_interactive_turn",
    prompt,
    schema: interactiveTutorOutputSchema,
    jsonSchema: interactiveTutorOutputJsonSchema,
    maxOutputTokens: 260
  });

  if (generated) {
    return generated;
  }

  return getSafeFallbackInteractiveTutorResponse(params.intent, params.hintLevel);
}
