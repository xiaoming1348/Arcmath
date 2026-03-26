import type { DiagnosticStage, ProblemSetCategory, ProblemSetSubmissionMode } from "@arcmath/db";

export type ProblemSetModeIdentity = {
  category: ProblemSetCategory;
  diagnosticStage?: DiagnosticStage | null;
  submissionMode: ProblemSetSubmissionMode;
  tutorEnabled: boolean;
};

export function isWholeSetSubmitMode(set: ProblemSetModeIdentity): boolean {
  return set.submissionMode === "WHOLE_SET_SUBMIT";
}

export function isPerProblemMode(set: ProblemSetModeIdentity): boolean {
  return set.submissionMode === "PER_PROBLEM";
}

export function isDiagnosticSet(set: ProblemSetModeIdentity): boolean {
  return set.category === "DIAGNOSTIC";
}

export function isRealExamSet(set: ProblemSetModeIdentity): boolean {
  return set.category === "REAL_EXAM";
}

export function isTopicPracticeSet(set: ProblemSetModeIdentity): boolean {
  return set.category === "TOPIC_PRACTICE";
}

export function getProblemSetModeLabel(set: ProblemSetModeIdentity): string {
  if (isDiagnosticSet(set)) {
    return "Diagnostic Test";
  }

  if (isTopicPracticeSet(set)) {
    return "Topic Practice";
  }

  return "Real Exam";
}

export function getDiagnosticStageLabel(stage: DiagnosticStage | null | undefined): string | null {
  switch (stage) {
    case "EARLY":
      return "Preparation Start";
    case "MID":
      return "Preparation Middle";
    case "LATE":
      return "Preparation Late";
    default:
      return null;
  }
}
