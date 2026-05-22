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

/**
 * Diagnostic-stage labels.
 *
 * We rebranded the original "Preparation Start / Middle / Late" tags
 * to Roman numerals + named tiers ("Level I — Foundation", etc).
 * Reasoning: the old names implied a timing on the student's prep
 * journey, which is opaque to a brand-new user. The new naming maps
 * directly to AMC problem difficulty so a user can self-place:
 *
 *   I   — Foundation:   easy AMC problems (≈ #1–#10 difficulty)
 *   II  — Intermediate: medium AMC (≈ #11–#20)
 *   III — Advanced:     hard AMC + early AIME (≈ #21–#25)
 *
 * Underlying enum values in the DB (EARLY/MID/LATE) are unchanged —
 * only the human-facing labels were redesigned.
 */
export function getDiagnosticStageLabel(stage: DiagnosticStage | null | undefined): string | null {
  switch (stage) {
    case "EARLY":
      return "Level I · Foundation";
    case "MID":
      return "Level II · Intermediate";
    case "LATE":
      return "Level III · Advanced";
    default:
      return null;
  }
}

export function getDiagnosticStageRoman(stage: DiagnosticStage | null | undefined): string | null {
  switch (stage) {
    case "EARLY":
      return "I";
    case "MID":
      return "II";
    case "LATE":
      return "III";
    default:
      return null;
  }
}

export function getDiagnosticStageTier(stage: DiagnosticStage | null | undefined): string | null {
  switch (stage) {
    case "EARLY":
      return "Foundation";
    case "MID":
      return "Intermediate";
    case "LATE":
      return "Advanced";
    default:
      return null;
  }
}

export function getDiagnosticStageDescription(stage: DiagnosticStage | null | undefined): string | null {
  switch (stage) {
    case "EARLY":
      return "Easy entry-level problems (similar to AMC problems #1–10). Recommended if you're new to competition math.";
    case "MID":
      return "Medium-difficulty problems (similar to AMC #11–20). Recommended if you can solve early-paper problems comfortably.";
    case "LATE":
      return "Hard contest-level problems (similar to AMC #21–25). Recommended if you can already finish the easier half consistently.";
    default:
      return null;
  }
}

/**
 * Locale-aware full label, used in badges on the problem set
 * detail page. Pass the `t` translator from i18n.
 *
 * Returns "Level I · Foundation" / "Level II · Intermediate" /
 * "Level III · Advanced" in English; "Level I · 基础" etc. in
 * Chinese. The Roman-numeral prefix is universal.
 */
export function getDiagnosticStageLabelI18n(
  stage: DiagnosticStage | null | undefined,
  t: (key: "problems.placement.tier_foundation" | "problems.placement.tier_intermediate" | "problems.placement.tier_advanced") => string
): string | null {
  const roman = getDiagnosticStageRoman(stage);
  if (!roman) return null;
  let tier: string | null = null;
  if (stage === "EARLY") tier = t("problems.placement.tier_foundation");
  else if (stage === "MID") tier = t("problems.placement.tier_intermediate");
  else if (stage === "LATE") tier = t("problems.placement.tier_advanced");
  return tier ? `Level ${roman} · ${tier}` : `Level ${roman}`;
}

/**
 * Stage ordering for UI sort. Lowest = easiest.
 */
export function getDiagnosticStageOrder(stage: DiagnosticStage | null | undefined): number {
  switch (stage) {
    case "EARLY":
      return 0;
    case "MID":
      return 1;
    case "LATE":
      return 2;
    default:
      return 99;
  }
}
