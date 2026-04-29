// USAMO (United States of America Mathematical Olympiad) ingest.
//
// The USAMO is a 6-problem, 2-day (9 hours total) proof-based olympiad
// run by the MAA. It selects candidates for the USA IMO team. For our
// admissions-track cohort the USAMO archive serves as "reach"
// material — strong AIME students work through select USAMO problems
// (usually 1, 2, 4 — the easier of the six) as part of their prep.
//
// Structure per year (no exam variants, one paper):
//  - Day 1: Problems 1, 2, 3 (4.5 hours)
//  - Day 2: Problems 4, 5, 6 (4.5 hours)
// Topic coverage rotates across (Algebra, Combinatorics, Geometry,
// Number Theory) — a typical USAMO paper hits each of the four at
// least once.
//
// Every problem is proof-based, so every problem ships as
// `answerFormat: "WORKED_SOLUTION"` with the official MAA solution
// in `solutionSketch`. The student UI renders the statement and
// surfaces the model solution on demand (collapsible) — we do not
// attempt auto-grading for USAMO problems.
//
// ## Why manifests instead of scraping
//
// The AoPS wiki has USAMO problems and community-written solutions,
// but they're community-edited and occasionally contain errors. For
// the admissions track we want a deterministic, reviewable ingestion
// path: a JSON manifest per year, hand-transcribed (and reviewed
// against the official MAA solutions PDF), validated against
// `@arcmath/shared/importProblemSetSchema`. This:
//
// - keeps every LaTeX fragment reviewable in code review
// - lets us attach topicKey (algebra / combinatorics / geometry /
//   number-theory) and technique tags that raw scraping can't
//   produce (SOS, Cauchy–Schwarz, extremal principle, etc.)
// - avoids re-distribution concerns while keeping the per-problem
//   text faithful to the original paper
//
// ## Problem layout we encode
//
// Filename convention: `usamo-<year>.json`. `problemSet.contest` must
// be `"USAMO"`; `problemSet.exam` must be null (USAMO has no
// variant). Problems are numbered 1..6 with `answerFormat:
// "WORKED_SOLUTION"` and populated `solutionSketch`. The schema
// enforces the 6-problem constraint via `expectedProblemCount`.
//
// This package deliberately does not hit the network — it only loads
// and validates manifests. The downstream committer (admin.import
// tRPC / commitImportFromJson) handles DB inserts.

export {
  loadUsamoManifest,
  loadAllUsamoManifests,
  USAMO_MANIFEST_DIR,
  type UsamoManifestLoadResult
} from "./load-manifest";
