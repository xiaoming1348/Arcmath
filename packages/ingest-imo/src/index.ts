// IMO (International Mathematical Olympiad) ingest.
//
// IMO is the apex secondary-school olympiad — 6 problems over 2 days
// (3/day, 4.5h each), all proof-based, run annually since 1959. For
// Arcmath this content sits above USAMO as the "you've cleared USAMO,
// here's the international circuit" tier.
//
// Structure per year (no exam variants, one paper):
//  - Day 1: Problems 1, 2, 3 (4.5 hours)
//  - Day 2: Problems 4, 5, 6 (4.5 hours)
// Topic coverage rotates across (Algebra, Combinatorics, Geometry,
// Number Theory). Each problem is worth 7 points. P3 and P6 are
// traditionally the hardest; P1 and P4 the most approachable.
//
// Every problem is proof-based, so every problem ships as
// `answerFormat: "WORKED_SOLUTION"` with the solution sketch in
// `solutionSketch`. The student UI renders the statement and surfaces
// the model solution on demand — we do not attempt auto-grading.
//
// ## Why manifests instead of scraping
//
// IMO problems are published as PDFs on imo-official.org. Hand-
// transcription into JSON manifests gives us:
//   - LaTeX-accurate statements (PDFs use math typography that doesn't
//     round-trip cleanly via OCR)
//   - editorial freedom to write or curate solutionSketch beyond the
//     IMO jury solutions (which are terse and assume olympiad fluency)
//   - reviewable, version-controlled history of what's in the catalog
//
// Manifests live in `src/manifests/imo-<year>.json`.
//
// ## Problem layout we encode
//
// Filename convention: `imo-<year>.json`. `problemSet.contest` must
// be `"IMO"`; `problemSet.exam` must be null. Problems are numbered
// 1..6 with `answerFormat: "WORKED_SOLUTION"` and a populated
// `solutionSketch`. The shared schema enforces the 6-problem
// constraint via `expectedProblemCount`.
//
// This package deliberately does not hit the network — it only loads
// and validates manifests. The downstream committer
// (admin.import tRPC / commitImportFromJson) handles DB inserts.

export {
  loadImoManifest,
  loadAllImoManifests,
  IMO_MANIFEST_DIR,
  type ImoManifestLoadResult
} from "./load-manifest";
