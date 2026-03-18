import type { Contest } from "@arcmath/db";
import { getRealTutorRolloutEntries } from "@/lib/real-tutor-rollout";

export const HINT_TUTOR_SEED_SOURCE_URL = "local://seed/hint-tutor";

const REAL_TUTOR_USABLE_SET_KEYS = getRealTutorRolloutEntries("live");

type ProblemSetIdentity = {
  contest: Contest;
  year: number;
  exam: string | null;
  sourceUrl: string | null;
};

function matchesRealTutorUsableSet(set: Pick<ProblemSetIdentity, "contest" | "year" | "exam">): boolean {
  return REAL_TUTOR_USABLE_SET_KEYS.some(
    (candidate) => candidate.contest === set.contest && candidate.year === set.year && candidate.exam === set.exam
  );
}

export function getTutorUsableSetKind(set: ProblemSetIdentity): "seeded" | "real" | null {
  if (set.sourceUrl === HINT_TUTOR_SEED_SOURCE_URL) {
    return "seeded";
  }

  if (matchesRealTutorUsableSet(set)) {
    return "real";
  }

  return null;
}

export function isTutorUsableProblemSet(set: ProblemSetIdentity): boolean {
  return getTutorUsableSetKind(set) !== null;
}

export function buildTutorUsableProblemSetWhere() {
  return {
    OR: [
      {
        sourceUrl: HINT_TUTOR_SEED_SOURCE_URL
      },
      ...REAL_TUTOR_USABLE_SET_KEYS.map((candidate) => ({
        contest: candidate.contest,
        year: candidate.year,
        exam: candidate.exam
      }))
    ]
  };
}

export function buildRealTutorUsableProblemSetWhere() {
  return {
    OR: REAL_TUTOR_USABLE_SET_KEYS.map((candidate) => ({
      contest: candidate.contest,
      year: candidate.year,
      exam: candidate.exam
    }))
  };
}
