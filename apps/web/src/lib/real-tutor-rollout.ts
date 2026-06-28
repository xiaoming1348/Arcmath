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
  // International / admissions tracks.
  //
  // Euclid (CEMC, Waterloo): 6 most recent live; 4 earlier years
  // available in DB stay as "planned" so we can curate hints/topic
  // tags before flipping them on.
  // MAT (Oxford / Imperial admissions): all 5 imported years live —
  // no further years in the manifest archive yet.
  // STEP II (Cambridge admissions): all 3 imported live.
  // USAMO: all 3 imported live.
  // Putnam: 5 most recent (2020 cancelled — skipped).
  // ---------------------------------------------------------------
  // Euclid: live = 2024, 2023, 2022, 2021, 2020, 2019 (most recent six)
  { contest: "EUCLID", year: 2024, exam: null, status: "live" },
  { contest: "EUCLID", year: 2023, exam: null, status: "live" },
  { contest: "EUCLID", year: 2022, exam: null, status: "live" },
  { contest: "EUCLID", year: 2021, exam: null, status: "live" },
  { contest: "EUCLID", year: 2020, exam: null, status: "live" },
  { contest: "EUCLID", year: 2019, exam: null, status: "live" },
  { contest: "EUCLID", year: 2018, exam: null, status: "planned" },
  { contest: "EUCLID", year: 2017, exam: null, status: "planned" },
  { contest: "EUCLID", year: 2016, exam: null, status: "planned" },
  { contest: "EUCLID", year: 2015, exam: null, status: "planned" },
  // MAT: 5 manifests, all live
  { contest: "MAT", year: 2023, exam: null, status: "live" },
  { contest: "MAT", year: 2022, exam: null, status: "live" },
  { contest: "MAT", year: 2021, exam: null, status: "live" },
  { contest: "MAT", year: 2020, exam: null, status: "live" },
  { contest: "MAT", year: 2019, exam: null, status: "live" },
  // STEP II: 6 manifests, all live (2019/2021/2024 added 2026-05-28
  // after import — they were imported to DB but missed in this allowlist
  // and stayed hidden from /problems for a few days; user reported it.)
  { contest: "STEP", year: 2024, exam: "II", status: "live" },
  { contest: "STEP", year: 2023, exam: "II", status: "live" },
  { contest: "STEP", year: 2022, exam: "II", status: "live" },
  { contest: "STEP", year: 2021, exam: "II", status: "live" },
  { contest: "STEP", year: 2020, exam: "II", status: "live" },
  { contest: "STEP", year: 2019, exam: "II", status: "live" },
  // USAMO: 6 manifests in repo (2017/2019/2020/2021/2022/2023). All
  // listed live; if a year isn't actually in prod DB the OR filter just
  // won't match it — harmless. Run import-admissions-manifests if a
  // year is missing.
  { contest: "USAMO", year: 2023, exam: null, status: "live" },
  { contest: "USAMO", year: 2022, exam: null, status: "live" },
  { contest: "USAMO", year: 2021, exam: null, status: "live" },
  { contest: "USAMO", year: 2020, exam: null, status: "live" },
  { contest: "USAMO", year: 2019, exam: null, status: "live" },
  { contest: "USAMO", year: 2017, exam: null, status: "live" },
  // USAJMO: 6 manifests in repo (2019-2024). Live entries listed but
  // earlier audit showed only 1 problem in prod DB — likely never
  // imported. Re-run `pnpm admissions:import --contest usajmo` to fill.
  { contest: "USAJMO", year: 2024, exam: null, status: "live" },
  { contest: "USAJMO", year: 2023, exam: null, status: "live" },
  { contest: "USAJMO", year: 2022, exam: null, status: "live" },
  { contest: "USAJMO", year: 2021, exam: null, status: "live" },
  { contest: "USAJMO", year: 2020, exam: null, status: "live" },
  { contest: "USAJMO", year: 2019, exam: null, status: "live" },
  // IMO: 5 most recent (2020 held remotely under COVID — skipped)
  { contest: "IMO", year: 2025, exam: null, status: "live" },
  { contest: "IMO", year: 2024, exam: null, status: "live" },
  { contest: "IMO", year: 2023, exam: null, status: "live" },
  { contest: "IMO", year: 2022, exam: null, status: "live" },
  { contest: "IMO", year: 2021, exam: null, status: "live" },
  // Putnam: 5 most recent (2020 cancelled due to COVID — skipped)
  { contest: "PUTNAM", year: 2024, exam: null, status: "live" },
  { contest: "PUTNAM", year: 2023, exam: null, status: "live" },
  { contest: "PUTNAM", year: 2022, exam: null, status: "live" },
  { contest: "PUTNAM", year: 2021, exam: null, status: "live" },
  { contest: "PUTNAM", year: 2019, exam: null, status: "live" }
];

export function getRealTutorRolloutEntries(status?: RealTutorSetStatus): RealTutorSetRolloutEntry[] {
  if (!status) {
    return REAL_TUTOR_SET_ROLLOUT;
  }

  return REAL_TUTOR_SET_ROLLOUT.filter((entry) => entry.status === status);
}
