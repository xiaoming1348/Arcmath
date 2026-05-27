// USAJMO (United States of America Junior Mathematical Olympiad) ingest.
//
// The USAJMO is a 6-problem, 2-day (9 hours total) proof-based
// olympiad run by the MAA, taken by the strongest AMC10/AIME
// performers. It's the "junior" sibling of USAMO — same structure,
// somewhat more approachable problem selection. For Arcmath's
// admissions track, USAJMO sits as the "stretch" tier above AIME
// for ambitious students aiming at top STEM admissions.
//
// Structure per year (no exam variants, one paper):
//  - Day 1: Problems 1, 2, 3 (4.5 hours)
//  - Day 2: Problems 4, 5, 6 (4.5 hours)
// Topic coverage rotates across (Algebra, Combinatorics, Geometry,
// Number Theory) — like USAMO. USAJMO routinely shares one or two
// problems with USAMO (typically the easier USAMO problems become
// medium USAJMO problems). We label any shared problem in
// `sourceLabel` with a parenthetical "also USAMO 2023/1" etc.
//
// Every problem is proof-based, so every problem ships as
// `answerFormat: "WORKED_SOLUTION"` with the solution sketch in
// `solutionSketch`. The student UI renders the statement and surfaces
// the model solution on demand (collapsible) — we do not attempt
// auto-grading for USAJMO problems.
//
// ## Why manifests instead of scraping
//
// Same rationale as USAMO: AoPS wiki text is community-edited and
// occasionally contains transcription errors. For a deterministic,
// reviewable ingestion path we hand-transcribe each year's paper
// from Evan Chen's authoritative solution notes (web.evanchen.cc)
// and Eric Shen's mirror (ericshen.net) — both of which compile from
// the official MAA problem packets and double-check via the AoPS
// community discussion threads. The manifest is then validated
// against `@arcmath/shared/importProblemSetSchema`.
//
// ## Problem layout we encode
//
// Filename convention: `usajmo-<year>.json`. `problemSet.contest`
// must be `"USAJMO"`; `problemSet.exam` must be null. Problems are
// numbered 1..6 with `answerFormat: "WORKED_SOLUTION"` and a
// populated `solutionSketch`. The shared schema enforces the
// 6-problem constraint via `expectedProblemCount`.
//
// This package deliberately does not hit the network — it only
// loads and validates manifests. The downstream committer
// (admin.import tRPC / commitImportFromJson) handles DB inserts.

export {
  loadUsajmoManifest,
  loadAllUsajmoManifests,
  USAJMO_MANIFEST_DIR,
  type UsajmoManifestLoadResult
} from "./load-manifest";
