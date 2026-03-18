import { z } from "zod";
import { callOpenAIJson } from "@/lib/ai/openai-json";

type LearningReportAttemptInput = {
  attemptId: string;
  problemId: string;
  submittedAnswer: string;
  normalizedAnswer: string | null;
  isCorrect: boolean;
  createdAt: string;
  problem: {
    statement: string | null;
    topicKey: string | null;
    difficultyBand: string | null;
  };
  hintUsageCount: number;
  highestHintLevel: number;
};

export type LearningReportInput = {
  userId: string;
  generatedAt: string;
  reportScope: {
    type: "practice-run" | "recent";
    practiceRunId: string | null;
    problemSetId: string | null;
    problemSetTitle: string | null;
    problemSetLabel: string | null;
    completedAt: string | null;
  };
  attempts: LearningReportAttemptInput[];
  recommendedProblems: Array<{
    problemId: string;
    number: number;
    topicKey: string | null;
    difficultyBand: string | null;
    statementSnippet: string;
  }>;
};

export type LearningReport = {
  totalProblemsAttempted: number;
  totalCorrect: number;
  primaryReinforcementTopic: string | null;
  topicsNeedingReinforcement: string[];
  highHintProblems: Array<{
    problemId: string;
    statementSnippet: string;
    hintUsageCount: number;
    highestHintLevel: number;
    topicKey: string | null;
    difficultyBand: string | null;
  }>;
  summary: string;
  learningPattern: string;
  nextPracticeSuggestions: string[];
};

export const LEARNING_REPORT_PROMPT_VERSION = "learning-report-v1";

type LearningReportPromptInput = {
  totalProblemsAttempted: number;
  totalCorrect: number;
  recentTopics: Array<{
    topicKey: string;
    attemptCount: number;
    incorrectCount: number;
    highHintCount: number;
  }>;
  difficultyBands: Array<{
    difficultyBand: string;
    attemptCount: number;
    correctCount: number;
  }>;
  highHintProblems: Array<{
    problemId: string;
    statementSnippet: string;
    hintUsageCount: number;
    highestHintLevel: number;
  }>;
  nextPracticeSuggestions: string[];
};

type LearningReportModelOutput = {
  performanceSummary: string;
  reinforcementTopics: string[];
  learningPattern: string;
  nextPracticeSuggestions: string[];
};

const learningReportOutputSchema = z.object({
  performanceSummary: z.string().min(1),
  reinforcementTopics: z.array(z.string().min(1)).min(1).max(3),
  learningPattern: z.string().min(1),
  nextPracticeSuggestions: z.array(z.string().min(1)).min(2).max(3)
});

const learningReportOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    performanceSummary: { type: "string" },
    reinforcementTopics: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string" }
    },
    learningPattern: { type: "string" },
    nextPracticeSuggestions: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string" }
    }
  },
  required: ["performanceSummary", "reinforcementTopics", "learningPattern", "nextPracticeSuggestions"]
} as const;

function formatTopicLabel(topicKey: string): string {
  return topicKey
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function makeStatementSnippet(statement: string | null): string {
  const normalized = (statement ?? "Untitled problem").replace(/\s+/g, " ").trim();

  if (normalized.length <= 96) {
    return normalized;
  }

  return `${normalized.slice(0, 93)}...`;
}

function buildSummary(
  totalProblemsAttempted: number,
  totalCorrect: number,
  weakTopics: string[],
  primaryWeakTopic: string | null,
  shouldStepDown: boolean
): string {
  if (totalProblemsAttempted === 0) {
    return "No recent attempt data is available yet.";
  }

  const accuracy = Math.round((totalCorrect / totalProblemsAttempted) * 100);
  const lead = `You attempted ${totalProblemsAttempted} problem${totalProblemsAttempted === 1 ? "" : "s"} recently and solved ${totalCorrect} correctly (${accuracy}% accuracy).`;

  if (weakTopics.length === 0) {
    return `${lead} Your recent work does not show a strong weakness pattern yet, so the next step is to keep building consistency with a few more problems.`;
  }

  if (primaryWeakTopic && shouldStepDown) {
    return `${lead} The clearest reinforcement priority is ${formatTopicLabel(primaryWeakTopic)}, and your next round should shift back to easier work in that topic before moving up again.`;
  }

  if (weakTopics.length === 1) {
    return `${lead} The clearest area to reinforce next is ${formatTopicLabel(weakTopics[0])}.`;
  }

  return `${lead} The clearest areas to reinforce next are ${formatTopicLabel(weakTopics[0])} and ${formatTopicLabel(weakTopics[1])}.`;
}

function buildLearningPattern(
  topicsNeedingReinforcement: string[],
  highHintProblemCount: number,
  primaryWeakTopic: string | null,
  hasWeakMediumOrHardPerformance: boolean
): string {
  if (topicsNeedingReinforcement.length === 0 && highHintProblemCount === 0) {
    return "Your recent attempts look fairly balanced, so the next priority is building a larger sample of work to confirm the pattern.";
  }

  if (primaryWeakTopic && hasWeakMediumOrHardPerformance) {
    return `Your weakest pattern is in ${formatTopicLabel(primaryWeakTopic)} when the difficulty steps up, so the right move is to reinforce the underlying method with easier follow-up before returning to medium or hard work.`;
  }

  if (topicsNeedingReinforcement.length > 0 && highHintProblemCount > 0) {
    return `You are showing the strongest friction when problems combine ${formatTopicLabel(topicsNeedingReinforcement[0])} with multi-step setup, which is also where hint usage is highest.`;
  }

  if (topicsNeedingReinforcement.length > 0) {
    return `Your errors are clustering around ${formatTopicLabel(topicsNeedingReinforcement[0])}, suggesting a concept-level gap more than a speed issue.`;
  }

  return "Your accuracy is more stable than your independence right now, because you are finishing problems but still leaning heavily on hints in a few spots.";
}

function difficultyRank(value: string): number {
  if (value === "EASY") {
    return 0;
  }

  if (value === "MEDIUM") {
    return 1;
  }

  if (value === "HARD") {
    return 2;
  }

  return 99;
}

function difficultyWeight(value: string | null): number {
  if (value === "HARD") {
    return 2;
  }

  if (value === "MEDIUM") {
    return 1;
  }

  return 0;
}

function formatDifficultyLabel(value: string): string {
  return value.toLowerCase();
}

function chooseSuggestedPracticeDifficulty(difficultyBands: string[], shouldStepDown: boolean): string | null {
  if (difficultyBands.length === 0) {
    return null;
  }

  const sorted = [...difficultyBands].sort((left, right) => difficultyRank(left) - difficultyRank(right));
  const currentLowest = sorted[0];

  if (!shouldStepDown) {
    return currentLowest;
  }

  if (sorted.includes("EASY")) {
    return "EASY";
  }

  if (sorted.includes("MEDIUM")) {
    return "EASY";
  }

  return "MEDIUM";
}

function buildPromptInput(
  report: LearningReport,
  attempts: LearningReportInput["attempts"]
): LearningReportPromptInput {
  const recentTopicsMap = new Map<
    string,
    { topicKey: string; attemptCount: number; incorrectCount: number; highHintCount: number }
  >();
  const difficultyBandsMap = new Map<
    string,
    { difficultyBand: string; attemptCount: number; correctCount: number }
  >();

  for (const attempt of attempts) {
    const topicKey = attempt.problem.topicKey;
    if (topicKey) {
      const currentTopic = recentTopicsMap.get(topicKey) ?? {
        topicKey,
        attemptCount: 0,
        incorrectCount: 0,
        highHintCount: 0
      };

      currentTopic.attemptCount += 1;
      if (!attempt.isCorrect) {
        currentTopic.incorrectCount += 1;
      }
      if (attempt.hintUsageCount >= 2 || attempt.highestHintLevel >= 3) {
        currentTopic.highHintCount += 1;
      }

      recentTopicsMap.set(topicKey, currentTopic);
    }

    const difficultyBand = attempt.problem.difficultyBand;
    if (difficultyBand) {
      const currentDifficulty = difficultyBandsMap.get(difficultyBand) ?? {
        difficultyBand,
        attemptCount: 0,
        correctCount: 0
      };

      currentDifficulty.attemptCount += 1;
      if (attempt.isCorrect) {
        currentDifficulty.correctCount += 1;
      }

      difficultyBandsMap.set(difficultyBand, currentDifficulty);
    }
  }

  return {
    totalProblemsAttempted: report.totalProblemsAttempted,
    totalCorrect: report.totalCorrect,
    recentTopics: Array.from(recentTopicsMap.values()).sort((left, right) => right.attemptCount - left.attemptCount),
    difficultyBands: Array.from(difficultyBandsMap.values()).sort(
      (left, right) => right.attemptCount - left.attemptCount
    ),
    highHintProblems: report.highHintProblems,
    nextPracticeSuggestions: report.nextPracticeSuggestions
  };
}

function buildLearningReportPrompt(input: LearningReportPromptInput): string {
  return [
    "You are an AI math tutor writing a short personalized learning report.",
    "Rules:",
    "- Return valid JSON only.",
    "- Keep the tone direct, encouraging, and specific.",
    "- Base every claim only on the provided attempt summary.",
    "- Reinforcement topics must be 2 to 3 concise topic keys or human-readable topic names.",
    "- Next-practice suggestions must stay aligned with the provided deterministic suggestions; improve wording, but do not invent a different recommendation strategy.",
    '- Output schema: {"performanceSummary":"string","reinforcementTopics":["string"],"learningPattern":"string","nextPracticeSuggestions":["string"]}',
    `Prompt version: ${LEARNING_REPORT_PROMPT_VERSION}`,
    `Report input:\n${JSON.stringify(input, null, 2)}`
  ].join("\n");
}

function buildDeterministicNextPracticeSuggestions(input: LearningReportInput, topicsNeedingReinforcement: string[]): string[] {
  const totalProblemsAttempted = input.attempts.length;
  const totalCorrect = input.attempts.filter((attempt) => attempt.isCorrect).length;
  const accuracy = totalProblemsAttempted > 0 ? totalCorrect / totalProblemsAttempted : 0;
  const topicStats = new Map<
    string,
    {
      attemptCount: number;
      correctCount: number;
      incorrectCount: number;
      highHintCount: number;
      highestHintLevelThreeCount: number;
      mediumOrHardWeakCount: number;
      difficultyBands: Set<string>;
    }
  >();

  for (const attempt of input.attempts) {
    const topicKey = attempt.problem.topicKey;
    if (!topicKey) {
      continue;
    }

    const current = topicStats.get(topicKey) ?? {
      attemptCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      highHintCount: 0,
      highestHintLevelThreeCount: 0,
      mediumOrHardWeakCount: 0,
      difficultyBands: new Set<string>()
    };

    current.attemptCount += 1;
    if (attempt.isCorrect) {
      current.correctCount += 1;
    } else {
      current.incorrectCount += 1;
    }

    if (attempt.hintUsageCount >= 2 || attempt.highestHintLevel >= 3) {
      current.highHintCount += 1;
    }

    if (attempt.highestHintLevel >= 3) {
      current.highestHintLevelThreeCount += 1;
    }

    if (
      difficultyWeight(attempt.problem.difficultyBand) > 0 &&
      (!attempt.isCorrect || attempt.hintUsageCount >= 2 || attempt.highestHintLevel >= 3)
    ) {
      current.mediumOrHardWeakCount += 1;
    }

    if (attempt.problem.difficultyBand) {
      current.difficultyBands.add(attempt.problem.difficultyBand);
    }

    topicStats.set(topicKey, current);
  }

  const suggestions: string[] = [];
  const primaryTopic = topicsNeedingReinforcement[0] ?? null;

  for (const topicKey of topicsNeedingReinforcement.slice(0, 2)) {
    const stats = topicStats.get(topicKey);
    const shouldStepDown =
      !!stats &&
      (
        stats.mediumOrHardWeakCount > 0 ||
        stats.highestHintLevelThreeCount > 0 ||
        stats.highHintCount >= 2 ||
        stats.incorrectCount >= Math.max(1, stats.correctCount)
      );
    const suggestedDifficulty = stats
      ? chooseSuggestedPracticeDifficulty(Array.from(stats.difficultyBands), shouldStepDown)
      : null;
    const topicLabel = formatTopicLabel(topicKey);

    if (suggestedDifficulty) {
      if (shouldStepDown) {
        if (stats?.mediumOrHardWeakCount) {
          suggestions.push(
            `Step back to ${formatDifficultyLabel(suggestedDifficulty)} ${topicLabel} problems next, because medium or hard work in this topic is still causing errors or heavy hint dependence.`
          );
        } else {
          suggestions.push(
            `Retry ${topicLabel} with ${formatDifficultyLabel(suggestedDifficulty)} problems before moving back up in difficulty.`
          );
        }
      } else {
        suggestions.push(
          `Continue practicing ${topicLabel} with ${formatDifficultyLabel(suggestedDifficulty)} problems and aim for two clean solves in a row.`
        );
      }
      continue;
    }

    suggestions.push(`Focus next on ${topicLabel} with 2 to 3 fresh practice problems.`);
  }

  if (suggestions.length < 3) {
    const highHintTopic = input.attempts.find(
      (attempt) =>
        (attempt.hintUsageCount >= 2 || attempt.highestHintLevel >= 3) && attempt.problem.topicKey !== null
    )?.problem.topicKey;

    if (highHintTopic) {
      suggestions.push(
        `Reinforce ${formatTopicLabel(highHintTopic)} by redoing one recent high-hint problem without asking for hints until after your first setup.`
      );
    }
  }

  if (suggestions.length < 3) {
    if (accuracy < 0.6 && topicsNeedingReinforcement[0]) {
      suggestions.push(
        `Stay on ${formatTopicLabel(topicsNeedingReinforcement[0])} until you can solve at least two easier problems correctly without heavy hints.`
      );
    } else if (topicsNeedingReinforcement[0]) {
      suggestions.push(
        `Reinforce ${formatTopicLabel(topicsNeedingReinforcement[0])} before moving on to less familiar topics.`
      );
    } else {
      suggestions.push("Keep practicing similar difficulty problems to confirm that your current accuracy is stable.");
    }
  }

  return suggestions.slice(0, 3);
}

function buildDeterministicLearningReport(input: LearningReportInput): LearningReport {
  const totalProblemsAttempted = input.attempts.length;
  const totalCorrect = input.attempts.filter((attempt) => attempt.isCorrect).length;

  const topicScores = new Map<string, number>();
  const topicWeakMediumOrHardCounts = new Map<string, number>();

  for (const attempt of input.attempts) {
    const topicKey = attempt.problem.topicKey;
    if (!topicKey) {
      continue;
    }

    const currentScore = topicScores.get(topicKey) ?? 0;
    let delta = 0;
    const weight = difficultyWeight(attempt.problem.difficultyBand);

    if (!attempt.isCorrect) {
      delta += 2 + weight;
    }

    if (attempt.hintUsageCount >= 2) {
      delta += 1 + weight;
    }

    if (attempt.highestHintLevel >= 3) {
      delta += 2 + weight;
    }

    topicScores.set(topicKey, currentScore + delta);

    if (
      weight > 0 &&
      (!attempt.isCorrect || attempt.hintUsageCount >= 2 || attempt.highestHintLevel >= 3)
    ) {
      topicWeakMediumOrHardCounts.set(topicKey, (topicWeakMediumOrHardCounts.get(topicKey) ?? 0) + 1);
    }
  }

  const topicsNeedingReinforcement = Array.from(topicScores.entries())
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([topicKey]) => topicKey);
  const primaryReinforcementTopic = topicsNeedingReinforcement[0] ?? null;
  const hasWeakMediumOrHardPerformance =
    !!primaryReinforcementTopic && (topicWeakMediumOrHardCounts.get(primaryReinforcementTopic) ?? 0) > 0;
  const nextPracticeSuggestions = buildDeterministicNextPracticeSuggestions(input, topicsNeedingReinforcement);

  const highHintProblems = input.attempts
    .filter((attempt) => attempt.hintUsageCount >= 2 || attempt.highestHintLevel >= 3)
    .sort((left, right) => {
      if (right.highestHintLevel !== left.highestHintLevel) {
        return right.highestHintLevel - left.highestHintLevel;
      }

      return right.hintUsageCount - left.hintUsageCount;
    })
    .slice(0, 3)
    .map((attempt) => ({
      problemId: attempt.problemId,
      statementSnippet: makeStatementSnippet(attempt.problem.statement),
      hintUsageCount: attempt.hintUsageCount,
      highestHintLevel: attempt.highestHintLevel,
      topicKey: attempt.problem.topicKey,
      difficultyBand: attempt.problem.difficultyBand
    }));

  return {
    totalProblemsAttempted,
    totalCorrect,
    primaryReinforcementTopic,
    topicsNeedingReinforcement,
    highHintProblems,
    summary: buildSummary(
      totalProblemsAttempted,
      totalCorrect,
      topicsNeedingReinforcement,
      primaryReinforcementTopic,
      hasWeakMediumOrHardPerformance
    ),
    learningPattern: buildLearningPattern(
      topicsNeedingReinforcement,
      highHintProblems.length,
      primaryReinforcementTopic,
      hasWeakMediumOrHardPerformance
    ),
    nextPracticeSuggestions
  };
}

export async function generateLearningReport(input: LearningReportInput): Promise<LearningReport> {
  const deterministicReport = buildDeterministicLearningReport(input);
  const promptInput = buildPromptInput(deterministicReport, input.attempts);
  const prompt = buildLearningReportPrompt(promptInput);

  const generated = await callOpenAIJson({
    scope: "learning-report",
    schemaName: "learning_report",
    prompt,
    schema: learningReportOutputSchema,
    jsonSchema: learningReportOutputJsonSchema,
    maxOutputTokens: 320
  });

  if (!generated) {
    return deterministicReport;
  }

  return {
    ...deterministicReport,
    summary: generated.performanceSummary,
    topicsNeedingReinforcement:
      generated.reinforcementTopics.length > 0
        ? generated.reinforcementTopics.slice(0, 3)
        : deterministicReport.topicsNeedingReinforcement,
    learningPattern: generated.learningPattern,
    nextPracticeSuggestions:
      generated.nextPracticeSuggestions.length > 0
        ? generated.nextPracticeSuggestions.slice(0, 3)
        : deterministicReport.nextPracticeSuggestions
  };
}
