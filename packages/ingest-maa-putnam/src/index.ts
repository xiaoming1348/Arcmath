// William Lowell Putnam Mathematical Competition ingest.
//
// The Putnam is the premier undergraduate math competition in North
// America, run annually by the MAA on the first Saturday of December.
// Each paper has 12 problems split into two 3-hour sessions:
//   - Morning (Session A): A1, A2, A3, A4, A5, A6
//   - Afternoon (Session B): B1, B2, B3, B4, B5, B6
// We flatten this into a single 12-problem set numbered 1..12
// (1..6 = A1..A6, 7..12 = B1..B6) so the existing student/teacher
// flows can render it without a special case.
//
// Topic coverage rotates across the standard buckets (algebra,
// analysis, combinatorics, geometry, number theory, linear algebra)
// — a typical Putnam paper hits five or six of those at varying
// difficulty.
//
// ## Difficulty / answer format
//
// Most Putnam problems have a definite numerical or closed-form
// answer (so they fit `INTEGER` or `EXPRESSION`), even though full
// credit on the actual contest requires a complete proof. We
// therefore ingest each problem with:
//   - `answerFormat: "EXPRESSION"` for closed-form answers (most
//     A1/A2/B1/B2 problems)
//   - `answerFormat: "INTEGER"` for problems with an integer answer
//   - `answerFormat: "WORKED_SOLUTION"` for the rare proof problem
//     where the answer is "prove …" with no scalar to record
// `solutionSketch` always carries the official MAA writeup so
// students can self-check their reasoning after submitting an answer.
//
// 2020 was cancelled due to COVID-19 — there is no 2020 paper.
//
// ## Why manifests instead of scraping
//
// The Putnam archive lives across the MAA site, Kedlaya's archive
// (https://kskedlaya.org/putnam-archive/), and AoPS. To keep ingestion
// reproducible we hand-transcribe a JSON manifest per year, validated
// against `@arcmath/shared/importProblemSetSchema`. This follows the
// same pattern as `ingest-maa-usamo`.
//
// Filename convention: `putnam-<year>.json`. `problemSet.contest`
// must be `"PUTNAM"`; `problemSet.exam` must be null. Problems are
// numbered 1..12 with `sourceLabel` carrying the canonical "A1",
// "B3", etc. label so the UI can show the original session label.

export {
  loadPutnamManifest,
  loadAllPutnamManifests,
  PUTNAM_MANIFEST_DIR,
  type PutnamManifestLoadResult
} from "./load-manifest";
