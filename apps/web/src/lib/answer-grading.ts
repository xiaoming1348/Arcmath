import { normalizeMathText } from "@/lib/generated-problem-set-pdf";

export type SupportedAnswerFormat = "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";

type GradeAnswerInput = {
  answerFormat: SupportedAnswerFormat;
  submittedAnswer: string;
  canonicalAnswer: string | null;
  choices?: unknown;
};

export type GradeAnswerResult = {
  normalizedSubmittedAnswer: string | null;
  isCorrect: boolean;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeChoiceText(value: string): string {
  return normalizeMathText(value)
    .replace(/^[A-E][\.\):]\s*/i, "")
    .replace(/[°]/g, "")
    .replace(/\bdegrees?\b/gi, "")
    .replace(/%/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeChoiceLabel(value: string): string | null {
  const trimmed = value.trim().toUpperCase();

  if (/^[A-E]$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^\(?([A-E])[\)\.\:]?$/);
  return match ? match[1] : null;
}

function normalizeChoices(choices: unknown): Array<{ label: string; text: string; normalizedText: string }> {
  if (!choices) {
    return [];
  }

  if (Array.isArray(choices)) {
    return choices
      .map((choice, index) => {
        const text = typeof choice === "string" ? choice : String(choice ?? "");
        return {
          label: String.fromCharCode(65 + index),
          text,
          normalizedText: normalizeChoiceText(text)
        };
      })
      .filter((choice) => choice.normalizedText.length > 0);
  }

  if (typeof choices === "object") {
    return Object.entries(choices as Record<string, unknown>)
      .map(([rawLabel, value]) => {
        const label = normalizeChoiceLabel(rawLabel) ?? rawLabel.trim().toUpperCase();
        const text = typeof value === "string" ? value : String(value ?? "");
        return {
          label,
          text,
          normalizedText: normalizeChoiceText(text)
        };
      })
      .filter((choice) => /^[A-E]$/.test(choice.label) && choice.normalizedText.length > 0);
  }

  return [];
}

function normalizeInteger(value: string): string | null {
  const compact = value.replace(/[\s,_]/g, "").trim();
  if (!compact) {
    return null;
  }

  if (!/^[+-]?\d+$/.test(compact)) {
    return null;
  }

  try {
    return BigInt(compact).toString();
  } catch {
    return null;
  }
}

function stripOuterParens(value: string): string {
  let current = value;

  while (current.startsWith("(") && current.endsWith(")")) {
    let depth = 0;
    let wrapsAll = true;

    for (let index = 0; index < current.length; index += 1) {
      const char = current[index];
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
      }

      if (depth === 0 && index < current.length - 1) {
        wrapsAll = false;
        break;
      }
    }

    if (!wrapsAll) {
      break;
    }

    current = current.slice(1, -1).trim();
  }

  return current;
}

function normalizeExpression(value: string): string | null {
  const normalized = normalizeMathText(value)
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();

  if (!normalized) {
    return null;
  }

  return stripOuterParens(normalized);
}

function gradeMultipleChoice(input: GradeAnswerInput): GradeAnswerResult {
  const choiceList = normalizeChoices(input.choices);
  const normalizedSubmittedText = normalizeChoiceText(input.submittedAnswer);
  const submittedLabel =
    normalizeChoiceLabel(input.submittedAnswer) ??
    choiceList.find((choice) => choice.normalizedText === normalizedSubmittedText)?.label ??
    null;

  const canonicalRaw = input.canonicalAnswer ?? "";
  const canonicalLabel =
    normalizeChoiceLabel(canonicalRaw) ??
    choiceList.find((choice) => choice.normalizedText === normalizeChoiceText(canonicalRaw))?.label ??
    null;

  if (submittedLabel && canonicalLabel) {
    return {
      normalizedSubmittedAnswer: submittedLabel,
      isCorrect: submittedLabel === canonicalLabel
    };
  }

  const normalizedSubmitted =
    submittedLabel ?? (normalizedSubmittedText.length > 0 ? normalizedSubmittedText : null);
  const normalizedCanonical = canonicalLabel ?? normalizeChoiceText(canonicalRaw);

  return {
    normalizedSubmittedAnswer: normalizedSubmitted,
    isCorrect: !!normalizedSubmitted && normalizedCanonical.length > 0 && normalizedSubmitted === normalizedCanonical
  };
}

function gradeInteger(input: GradeAnswerInput): GradeAnswerResult {
  const normalizedSubmittedAnswer = normalizeInteger(input.submittedAnswer);
  const normalizedCanonicalAnswer = normalizeInteger(input.canonicalAnswer ?? "");

  return {
    normalizedSubmittedAnswer,
    isCorrect:
      normalizedSubmittedAnswer !== null &&
      normalizedCanonicalAnswer !== null &&
      normalizedSubmittedAnswer === normalizedCanonicalAnswer
  };
}

function gradeExpression(input: GradeAnswerInput): GradeAnswerResult {
  const normalizedSubmittedAnswer = normalizeExpression(input.submittedAnswer);
  const normalizedCanonicalAnswer = normalizeExpression(input.canonicalAnswer ?? "");

  return {
    normalizedSubmittedAnswer,
    isCorrect:
      normalizedSubmittedAnswer !== null &&
      normalizedCanonicalAnswer !== null &&
      normalizedSubmittedAnswer === normalizedCanonicalAnswer
  };
}

export function gradeAnswer(input: GradeAnswerInput): GradeAnswerResult {
  if (input.answerFormat === "MULTIPLE_CHOICE") {
    return gradeMultipleChoice(input);
  }

  if (input.answerFormat === "INTEGER") {
    return gradeInteger(input);
  }

  return gradeExpression(input);
}

export function normalizeSubmittedAnswer(input: GradeAnswerInput): string | null {
  return gradeAnswer(input).normalizedSubmittedAnswer;
}

export function normalizeCanonicalAnswer(input: GradeAnswerInput): string | null {
  if (input.answerFormat === "MULTIPLE_CHOICE") {
    const choices = normalizeChoices(input.choices);
    const canonicalRaw = input.canonicalAnswer ?? "";
    return (
      normalizeChoiceLabel(canonicalRaw) ??
      choices.find((choice) => choice.normalizedText === normalizeChoiceText(canonicalRaw))?.label ??
      (normalizeChoiceText(canonicalRaw) || null)
    );
  }

  if (input.answerFormat === "INTEGER") {
    return normalizeInteger(input.canonicalAnswer ?? "");
  }

  return normalizeExpression(input.canonicalAnswer ?? "");
}
