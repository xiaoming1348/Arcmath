import {
  type DiagnosticExamBlueprint,
  type DifficultyBand,
  type ExamTrack,
  getDiagnosticBlueprint
} from "./diagnostic-blueprints";

export type DiagnosticCandidateProblem = {
  problemId: string;
  problemSetId: string;
  problemSetTitle: string;
  problemNumber: number;
  examTrack: ExamTrack | null;
  topicKey: string | null;
  techniqueTags: string[];
  difficultyBand: DifficultyBand | null;
  diagnosticEligible: boolean;
  statement: string | null;
};

export type DiagnosticSelectionSlot = {
  topicKey: string;
  topicLabel: string;
  targetDifficulty: DifficultyBand;
};

export type DiagnosticSelectionResult = {
  exam: ExamTrack;
  selectedProblemIds: string[];
  selectedProblems: DiagnosticCandidateProblem[];
  slots: DiagnosticSelectionSlot[];
  missingSlots: DiagnosticSelectionSlot[];
};

const DIFFICULTY_SLOT_ORDER: DifficultyBand[] = [
  "EASY",
  "EASY",
  "EASY",
  "EASY",
  "MEDIUM",
  "MEDIUM",
  "MEDIUM",
  "MEDIUM",
  "HARD",
  "HARD"
];

function problemMatchesTopic(problem: DiagnosticCandidateProblem, topicPrefixes: string[]): boolean {
  return Boolean(problem.topicKey && topicPrefixes.some((prefix) => problem.topicKey?.startsWith(prefix)));
}

function scoreCandidate(
  problem: DiagnosticCandidateProblem,
  targetDifficulty: DifficultyBand,
  topicPrefixes: string[]
): number {
  let score = 0;

  if (problem.difficultyBand === targetDifficulty) {
    score += 100;
  } else if (problem.difficultyBand === "MEDIUM" && targetDifficulty !== "MEDIUM") {
    score += 25;
  } else if (problem.difficultyBand) {
    score += 10;
  }

  if (problemMatchesTopic(problem, topicPrefixes)) {
    score += 50;
  }

  if (problem.statement?.trim()) {
    score += 5;
  }

  score -= problem.problemNumber / 1000;
  return score;
}

export function buildDiagnosticSlots(blueprint: DiagnosticExamBlueprint): DiagnosticSelectionSlot[] {
  const repeatedTopics = blueprint.topics.flatMap((topic) =>
    Array.from({ length: topic.targetQuestionCount }, () => ({
      topicKey: topic.key,
      topicLabel: topic.label,
      topicPrefixes: topic.primaryTopicPrefixes
    }))
  );

  return repeatedTopics.map((topic, index) => ({
    topicKey: topic.topicKey,
    topicLabel: topic.topicLabel,
    targetDifficulty: DIFFICULTY_SLOT_ORDER[index] ?? "MEDIUM"
  }));
}

export function selectDiagnosticProblems(
  exam: ExamTrack,
  problems: DiagnosticCandidateProblem[]
): DiagnosticSelectionResult {
  const blueprint = getDiagnosticBlueprint(exam);
  const slots = buildDiagnosticSlots(blueprint);
  const selectedProblems: DiagnosticCandidateProblem[] = [];
  const selectedIds = new Set<string>();
  const missingSlots: DiagnosticSelectionSlot[] = [];

  for (const slot of slots) {
    const topicBlueprint = blueprint.topics.find((topic) => topic.key === slot.topicKey);
    if (!topicBlueprint) {
      missingSlots.push(slot);
      continue;
    }

    const candidates = problems
      .filter(
        (problem) =>
          problem.diagnosticEligible &&
          problem.examTrack === exam &&
          !selectedIds.has(problem.problemId) &&
          problemMatchesTopic(problem, topicBlueprint.primaryTopicPrefixes)
      )
      .sort(
        (left, right) =>
          scoreCandidate(right, slot.targetDifficulty, topicBlueprint.primaryTopicPrefixes) -
          scoreCandidate(left, slot.targetDifficulty, topicBlueprint.primaryTopicPrefixes)
      );

    const chosen = candidates[0];
    if (!chosen) {
      missingSlots.push(slot);
      continue;
    }

    selectedIds.add(chosen.problemId);
    selectedProblems.push(chosen);
  }

  return {
    exam,
    selectedProblemIds: selectedProblems.map((problem) => problem.problemId),
    selectedProblems,
    slots,
    missingSlots
  };
}

