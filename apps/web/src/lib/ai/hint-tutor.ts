import { z } from "zod";
import { callOpenAIJson } from "@/lib/ai/openai-json";

// Last-resort hint strings used when *both* of these fail:
//   1. There's no curated/precomputed hint stored on the Problem row
//   2. The LLM (callOpenAIJson) returned null — typically because
//      OPENAI_API_KEY is unset OR the API call hit a parse/network
//      error after retry
//
// We deliberately don't try to be "helpful" here — these strings
// should NEVER be what a paying student sees. If you see them in
// prod the real fix is "make sure OPENAI_API_KEY is set + valid";
// these are just emergency padding so the UI doesn't render an
// empty bubble.
//
// The unified-attempt router stamps `promptVersion: "fallback-vN"`
// on usages that hit this branch so we can grep prod logs and
// catch silent regressions.
const HINT_FALLBACKS = {
  1: "Hint generation is temporarily unavailable. Re-read the problem and identify what's known vs. what's asked. (If you keep seeing this message, ping your teacher — the AI tutor isn't reachable right now.)",
  2: "Hint generation is temporarily unavailable. Try rewriting the key relationship or quantity from the problem in your own notation.",
  3: "Hint generation is temporarily unavailable. Compare the structure of this problem to one you've solved before — what changes, what stays the same?"
} as const;

export const HINT_TUTOR_PROMPT_VERSION = "hint-tutor-v1";

// WORKED_SOLUTION = Putnam / USAMO / STEP / MAT long-form problems.
// We don't auto-grade them, but the hint flow IS still useful (a
// stuck student wants a nudge regardless of whether the platform
// auto-grades). The LLM hint prompt uses solutionSketch as hidden
// teacher context, which the manifests for these contests provide.
export type HintTutorAnswerFormat = "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION" | "WORKED_SOLUTION";
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

  // For multiple-choice answers we only block patterns that
  // specifically name the *correct* answer letter — "the answer is
  // C", "choose option C", etc. The pre-existing patterns from
  // buildMultipleChoiceLeakPatterns(answer) already cover these.
  if (/^[a-e]$/i.test(normalizedAnswer)) {
    const leakPatterns = buildMultipleChoiceLeakPatterns(normalizedAnswer.toUpperCase());
    if (leakPatterns.some((pattern) => pattern.test(hintText))) {
      return true;
    }
    // Don't fall through to the generic "answer is X" check below —
    // for MC, the only thing that should leak is the actual answer
    // letter. A hint that says "Notice the answer is symmetric" or
    // "the option you pick must be even" is fine. The previous
    // catch-all regex `/answer is|choose [a-e]/` was firing on these
    // legitimate hints and shoving every MC hint into the safe
    // fallback. That's why students were seeing "Think about the key
    // concept" everywhere.
    return false;
  }

  // For non-MC (INTEGER, EXPRESSION, WORKED_SOLUTION): block if the
  // hint contains the actual answer string. Only run this when the
  // answer is non-empty AND at least 2 chars (else we'd block
  // hints whenever the integer "0" appears anywhere, e.g. "subscript 0").
  if (normalizedAnswer.length >= 2 && normalizedHint.includes(normalizedAnswer)) {
    return true;
  }

  // Also catch obvious "the final answer is …" giveaways even when
  // the answer string is empty (e.g. WORKED_SOLUTION with null
  // canonicalAnswer): the LLM still shouldn't promise the conclusion.
  return /\b(?:the\s+)?(?:final\s+)?answer\s+is\s+/i.test(hintText);
}

/**
 * Strip LaTeX delimiters / markdown decorations and split the sketch
 * into clean sentences. Used by the fallback path to surface a
 * problem-specific nudge when the LLM call fails or is unavailable.
 *
 * Why not just feed the raw sketch? Putnam / USAMO solution sketches
 * often contain `$$...$$` math blocks, **bold** markers, and
 * "Answer: X." giveaways. We want a clean, hint-shaped excerpt that
 * (a) doesn't reveal the conclusion and (b) reads as a sentence.
 */
function extractSketchSentences(sketch: string): string[] {
  // Strip the LaTeX/Markdown noise that would look weird as a hint.
  const stripped = sketch
    .replace(/\$\$[^$]+\$\$/g, "(equation)")
    .replace(/\$[^$]+\$/g, "(expression)")
    .replace(/\\[a-zA-Z]+(?:\{[^}]*\})?/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*-\s+/gm, "")
    .replace(/^#+\s+/gm, "")
    // Drop leading "Answer: ..." preambles entirely — those leak.
    .replace(/^\s*\*?\*?Answer\*?\*?:[^\n]+\n?/gim, "")
    .replace(/\s+/g, " ")
    .trim();
  // Split on sentence boundaries; skip empties and very short fragments.
  return stripped
    .split(/(?<=[.!?])\s+(?=[A-Z\d])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

/**
 * Build a problem-specific fallback hint by excerpting the solution
 * sketch. Level 1 takes the first sentence (broadest direction);
 * level 2 takes the second sentence if available (a setup nudge);
 * level 3 concatenates two sentences for more detail. If the sketch
 * is empty or unusable, fall back to the generic strings.
 *
 * Even when this returns excerpted text, hintLeaksFinalAnswer is
 * applied at the call site — so a sketch that says "Answer: 42"
 * still gets caught by the leak filter and swapped for a safer
 * version.
 */
function deriveHintFromSketch(sketch: string | null | undefined, level: 1 | 2 | 3): string | null {
  const trimmed = sketch?.trim();
  if (!trimmed) return null;
  const sentences = extractSketchSentences(trimmed);
  if (sentences.length === 0) return null;
  if (level === 1) return sentences[0];
  if (level === 2) return sentences[1] ?? sentences[0];
  // level 3: as much as we can muster
  return sentences.slice(0, 2).join(" ");
}

/**
 * Safe fallback hint. Prefers a sketch-derived problem-specific
 * sentence when available; otherwise the generic
 * `HINT_FALLBACKS[level]` string. Generic strings are a last-resort
 * — they're useless for hard problems, which is why every callsite
 * that has a sketch should prefer the sketch path.
 */
export function getSafeFallbackHint(
  level: number,
  options?: { solutionSketch?: string | null }
): HintModelOutput {
  const safeLevel = clampHintLevel(level);
  const sketchHint = deriveHintFromSketch(options?.solutionSketch, safeLevel);
  return {
    hintText: sketchHint ?? HINT_FALLBACKS[safeLevel],
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

  // LLM unavailable / failed → fall back to a sketch-derived hint.
  // This is the path that fires when OPENAI_API_KEY is missing on a
  // deployment, when OpenAI rate-limits, or when JSON parsing fails
  // even after the in-callOpenAIJson retry. Without this branch every
  // hint on every problem reads as the generic "Think about the key
  // concept" string, which is what students reported.
  const sketchHint = deriveHintFromSketch(params.solutionSketch, safeLevel);
  if (sketchHint) {
    // Mirror the generic fallback's check-questions per level so the
    // surface contract stays consistent.
    const checkQuestion =
      safeLevel === 1
        ? "Which idea or theorem seems most relevant here?"
        : safeLevel === 2
          ? "What equation or structure captures the problem?"
          : "What detailed step or substitution moves you forward?";
    return { hintText: sketchHint, checkQuestion };
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
