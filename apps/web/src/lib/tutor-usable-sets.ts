import type { Contest, ProblemSetCategory, ProblemSetSubmissionMode } from "@arcmath/db";
import { getRealTutorRolloutEntries } from "@/lib/real-tutor-rollout";

export const HINT_TUTOR_SEED_SOURCE_URL = "local://seed/diagnostic-test";

const LIVE_REAL_EXAM_KEYS = getRealTutorRolloutEntries("live");

type ProblemSetIdentity = {
  contest?: Contest;
  year?: number;
  exam?: string | null;
  sourceUrl: string | null;
  category: ProblemSetCategory;
  submissionMode: ProblemSetSubmissionMode;
  tutorEnabled: boolean;
};

export type TutorUsableProblemSetWhere = {
  category?: ProblemSetCategory;
  sourceUrl?: string;
  tutorEnabled?: boolean;
  submissionMode?: ProblemSetSubmissionMode;
  OR?: Array<{
    contest: Contest;
    year: number;
    exam: string | null;
  }>;
};

export function getTutorUsableSetKind(set: ProblemSetIdentity): "diagnostic" | "real_exam" | "topic_practice" | null {
  if (set.category === "DIAGNOSTIC" && set.sourceUrl === HINT_TUTOR_SEED_SOURCE_URL) {
    return "diagnostic";
  }

  if (
    set.category === "REAL_EXAM" &&
    LIVE_REAL_EXAM_KEYS.some(
      (candidate) =>
        candidate.contest === set.contest &&
        candidate.year === set.year &&
        candidate.exam === (set.exam ?? null)
    )
  ) {
    return "real_exam";
  }

  if (set.category === "TOPIC_PRACTICE") {
    return "topic_practice";
  }

  return null;
}

export function isTutorUsableProblemSet(set: ProblemSetIdentity): boolean {
  return getTutorUsableSetKind(set) !== null;
}

export function buildDiagnosticProblemSetWhere(): TutorUsableProblemSetWhere {
  return {
    category: "DIAGNOSTIC",
    sourceUrl: HINT_TUTOR_SEED_SOURCE_URL,
    submissionMode: "WHOLE_SET_SUBMIT",
    tutorEnabled: false
  };
}

export function buildRealExamProblemSetWhere(): TutorUsableProblemSetWhere {
  return {
    category: "REAL_EXAM",
    OR: LIVE_REAL_EXAM_KEYS.map((candidate) => ({
      contest: candidate.contest,
      year: candidate.year,
      exam: candidate.exam
    }))
  };
}

export function buildTopicPracticeProblemSetWhere(): TutorUsableProblemSetWhere {
  return {
    category: "TOPIC_PRACTICE",
    submissionMode: "PER_PROBLEM",
    tutorEnabled: true
  };
}
