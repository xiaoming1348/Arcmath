// Euclid (CEMC / University of Waterloo) contest ingest.
//
// The Euclid exam is a 10-question, 2.5-hour paper written every spring
// in Canada. Used by Waterloo for admissions to several undergraduate
// math/CS programs, and widely written by international-school students
// aiming at Canadian universities. One paper per year, no exam variants.
//
// ## Why manifests instead of scraping
//
// CEMC publishes the official paper as a clean PDF alongside the
// official solutions PDF on their website. For the pilot we want a
// deterministic, reviewable ingestion path: a JSON manifest per year,
// hand-transcribed from the CEMC PDF, validated against
// `@arcmath/shared/importProblemSetSchema`. This:
//
// - avoids bot-detection / TOS concerns
// - keeps the math rendering source of truth inside the repo (LaTeX
//   fragments are hand-authored, so we can proofread them once)
// - lets us attach pedagogically valuable metadata (topicKey, technique
//   tags, curated hints) that live scraping can't produce
//
// ## Problem structure we assume (from the 2015–2024 archive)
//
// - Questions 1–5 are short-answer, with one or more numeric or
//   closed-form answers. We flatten these to INTEGER / EXPRESSION.
// - Questions 6–10 are longer, usually requiring full solutions. Those
//   that have a single clean final answer stay INTEGER/EXPRESSION;
//   those that are explicitly "show that…" become WORKED_SOLUTION with
//   the official solution surfaced for self-check.
//
// This package deliberately does not hit the network — it only loads
// and validates manifests. The downstream committer (admin.import
// tRPC / upsertContestProblemSet) handles DB inserts.

export {
  loadEuclidManifest,
  loadAllEuclidManifests,
  EUCLID_MANIFEST_DIR,
  type EuclidManifestLoadResult
} from "./load-manifest";
