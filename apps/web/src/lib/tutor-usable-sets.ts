import type { Contest } from "@arcmath/db";
import { getRealTutorRolloutEntries } from "@/lib/real-tutor-rollout";

export const HINT_TUTOR_SEED_SOURCE_URL = "local://seed/diagnostic-test";

const REAL_TUTOR_USABLE_SET_KEYS = getRealTutorRolloutEntries("live");

type ProblemSetIdentity = {
  contest?: Contest;
  year?: number;
  exam?: string | null;
  sourceUrl: string | null;
};

export type TutorUsableProblemSetWhere = {
  sourceUrl?: string;
  OR?: Array<{
    contest: Contest;
    year: number;
    exam: string | null;
  }>;
};

export function getTutorUsableSetKind(set: ProblemSetIdentity): "seeded" | "real" | null {
  if (set.sourceUrl === HINT_TUTOR_SEED_SOURCE_URL) {
    return "seeded";
  }

  if (
    REAL_TUTOR_USABLE_SET_KEYS.some(
      (candidate) =>
        candidate.contest === set.contest &&
        candidate.year === set.year &&
        candidate.exam === (set.exam ?? null)
    )
  ) {
    return "real";
  }

  return null;
}

export function isTutorUsableProblemSet(set: ProblemSetIdentity): boolean {
  return getTutorUsableSetKind(set) !== null;
}

export function buildTutorUsableProblemSetWhere(): TutorUsableProblemSetWhere {
  return {
    sourceUrl: HINT_TUTOR_SEED_SOURCE_URL
  };
}

export function buildRealTutorUsableProblemSetWhere(): TutorUsableProblemSetWhere {
  return {
    OR: REAL_TUTOR_USABLE_SET_KEYS.map((candidate) => ({
      contest: candidate.contest,
      year: candidate.year,
      exam: candidate.exam
    }))
  };
}
