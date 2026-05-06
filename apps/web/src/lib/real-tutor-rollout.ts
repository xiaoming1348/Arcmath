import type { Contest } from "@arcmath/db";

export type RealTutorSetStatus = "live" | "planned";

export type RealTutorSetRolloutEntry = {
  contest: Contest;
  year: number;
  exam: string | null;
  status: RealTutorSetStatus;
};

// What "live" means here:
//   - The set is fully populated in the DB (statement, answer, choices
//     where applicable), reviewed for content, and ready for students.
//   - It will appear in /problems for any user who passes premium-access
//     gating (see tutor-premium-access.ts). For pilots running with
//     DISABLE_ACCESS_GATING=1 every authenticated user sees it.
//
// "planned" means we know it exists upstream but the import or QA pass
// isn't done yet, so we leave it off the catalog. Promote to "live"
// only after running scripts/check-rollout-readiness.ts and confirming
// all problems have non-placeholder statements + answers.
export const REAL_TUTOR_SET_ROLLOUT: RealTutorSetRolloutEntry[] = [
  // ---------------------------------------------------------------
  // AMC 8 — 25 problems each
  // ---------------------------------------------------------------
  { contest: "AMC8", year: 2015, exam: null, status: "live" },
  { contest: "AMC8", year: 2016, exam: null, status: "live" },
  { contest: "AMC8", year: 2017, exam: null, status: "live" },
  { contest: "AMC8", year: 2018, exam: null, status: "live" },
  { contest: "AMC8", year: 2019, exam: null, status: "live" },
  { contest: "AMC8", year: 2020, exam: null, status: "live" },
  // 2021 was cancelled (no AMC 8 administered).
  { contest: "AMC8", year: 2022, exam: null, status: "live" },
  { contest: "AMC8", year: 2023, exam: null, status: "live" },
  { contest: "AMC8", year: 2024, exam: null, status: "live" },
  { contest: "AMC8", year: 2025, exam: null, status: "live" },

  // ---------------------------------------------------------------
  // AMC 10 — 25 problems each, A and B forms
  // ---------------------------------------------------------------
  { contest: "AMC10", year: 2013, exam: "A", status: "live" },
  { contest: "AMC10", year: 2015, exam: "A", status: "live" },
  { contest: "AMC10", year: 2016, exam: "A", status: "live" },
  { contest: "AMC10", year: 2017, exam: "A", status: "live" },
  { contest: "AMC10", year: 2018, exam: "A", status: "live" },
  { contest: "AMC10", year: 2019, exam: "A", status: "live" },
  { contest: "AMC10", year: 2020, exam: "A", status: "live" },
  { contest: "AMC10", year: 2021, exam: "A", status: "live" },
  { contest: "AMC10", year: 2022, exam: "A", status: "live" },
  { contest: "AMC10", year: 2023, exam: "A", status: "live" },
  { contest: "AMC10", year: 2024, exam: "A", status: "live" },
  // 2024 B has one missing statement → keep planned until backfilled.
  { contest: "AMC10", year: 2024, exam: "B", status: "planned" },
  { contest: "AMC10", year: 2025, exam: "A", status: "live" },
  { contest: "AMC10", year: 2025, exam: "B", status: "live" },

  // ---------------------------------------------------------------
  // AMC 12 — 25 problems each
  // ---------------------------------------------------------------
  { contest: "AMC12", year: 2015, exam: "A", status: "live" },
  { contest: "AMC12", year: 2016, exam: "A", status: "live" },
  { contest: "AMC12", year: 2017, exam: "A", status: "live" },
  { contest: "AMC12", year: 2018, exam: "A", status: "live" },
  { contest: "AMC12", year: 2019, exam: "A", status: "live" },
  { contest: "AMC12", year: 2020, exam: "A", status: "live" },
  { contest: "AMC12", year: 2021, exam: "A", status: "live" },
  { contest: "AMC12", year: 2022, exam: "A", status: "live" },
  { contest: "AMC12", year: 2023, exam: "A", status: "live" },
  { contest: "AMC12", year: 2024, exam: "A", status: "live" },
  // 2024 B has one missing statement → planned until backfilled.
  { contest: "AMC12", year: 2024, exam: "B", status: "planned" },
  { contest: "AMC12", year: 2025, exam: "A", status: "live" },
  { contest: "AMC12", year: 2025, exam: "B", status: "live" },

  // ---------------------------------------------------------------
  // AIME — 15 problems each, I and II
  // ---------------------------------------------------------------
  { contest: "AIME", year: 2015, exam: "I", status: "live" },
  { contest: "AIME", year: 2015, exam: "II", status: "live" },
  { contest: "AIME", year: 2016, exam: "I", status: "live" },
  { contest: "AIME", year: 2016, exam: "II", status: "live" },
  { contest: "AIME", year: 2017, exam: "I", status: "live" },
  { contest: "AIME", year: 2017, exam: "II", status: "live" },
  { contest: "AIME", year: 2018, exam: "I", status: "live" },
  { contest: "AIME", year: 2018, exam: "II", status: "live" },
  { contest: "AIME", year: 2019, exam: "I", status: "live" },
  // 2019 II — 2023 II not yet imported; leave as planned so we can
  // cleanly backfill them in one batch.
  { contest: "AIME", year: 2019, exam: "II", status: "planned" },
  { contest: "AIME", year: 2020, exam: "I", status: "live" },
  { contest: "AIME", year: 2020, exam: "II", status: "planned" },
  { contest: "AIME", year: 2021, exam: "I", status: "live" },
  { contest: "AIME", year: 2021, exam: "II", status: "planned" },
  { contest: "AIME", year: 2022, exam: "I", status: "live" },
  { contest: "AIME", year: 2022, exam: "II", status: "planned" },
  { contest: "AIME", year: 2023, exam: "I", status: "live" },
  { contest: "AIME", year: 2023, exam: "II", status: "planned" },
  { contest: "AIME", year: 2024, exam: "I", status: "live" },
  { contest: "AIME", year: 2024, exam: "II", status: "live" },
  { contest: "AIME", year: 2025, exam: "I", status: "live" },
  { contest: "AIME", year: 2025, exam: "II", status: "live" },

  // ---------------------------------------------------------------
  // International / admissions tracks. Each entry is a single sample
  // year that's been hand-reviewed; rest of each archive will be
  // backfilled one batch at a time.
  // ---------------------------------------------------------------
  { contest: "EUCLID", year: 2024, exam: null, status: "live" },
  { contest: "MAT", year: 2023, exam: null, status: "live" },
  { contest: "STEP", year: 2023, exam: "II", status: "live" },
  { contest: "USAMO", year: 2020, exam: null, status: "live" }
];

export function getRealTutorRolloutEntries(status?: RealTutorSetStatus): RealTutorSetRolloutEntry[] {
  if (!status) {
    return REAL_TUTOR_SET_ROLLOUT;
  }

  return REAL_TUTOR_SET_ROLLOUT.filter((entry) => entry.status === status);
}
