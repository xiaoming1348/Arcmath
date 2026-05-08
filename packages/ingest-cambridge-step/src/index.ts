// STEP (Sixth Term Examination Paper, Cambridge) ingest.
//
// STEP is a suite of 3-hour papers used for conditional offers to
// Cambridge, Imperial, Warwick and a handful of other UK mathematics
// departments. Papers are labelled I / II / III:
//
// - STEP I (discontinued after June 2020; kept here for the 2016–2020
//   archive — still on many admissions profiles for repeat offers)
// - STEP II and STEP III (current, used by Cambridge for
//   undergraduate mathematics offers; STEP III is noticeably harder
//   and covers some undergraduate material)
//
// Each paper has 12 questions (8 Pure / 3 Mechanics / 2 Probability &
// Stats, roughly). Candidates attempt any 6, and their top-6 marks
// count. Every question is a multi-part investigation, typically
// ending with "hence..." or "deduce...". There is no answer key that
// a scalar grader can check — STEP markers award partial credit
// against a mark scheme. We therefore encode every STEP problem as
// `answerFormat: "WORKED_SOLUTION"` with the official examiner's
// hints / model solution in `solutionSketch`; students use the UI
// to compare their own working against the authoritative write-up.
//
// ## Why manifests instead of scraping
//
// The STEP past papers are distributed by Cambridge Assessment
// Admissions Testing as PDFs. For our pilot we want a deterministic,
// reviewable ingestion path: a JSON manifest per (year, paper-variant),
// hand-transcribed from the official PDF, validated against
// `@arcmath/shared/importProblemSetSchema`. This:
//
// - keeps every LaTeX fragment reviewable in code review
// - lets us attach topicKey (pure-calculus / vectors / mechanics /
//   probability) and technique tags that scraping can't produce
// - avoids re-distribution-of-PDFs concerns while letting us keep
//   per-problem text faithful to the source (short problem-length
//   excerpts for teaching use, with full attribution)
//
// ## Problem layout we encode
//
// Filename convention: `step-<year>-<variant>.json`, e.g.
// `step-2020-III.json`. `problemSet.contest` must be `"STEP"` and
// `problemSet.exam` must be one of `"I"`, `"II"`, `"III"`. Problems
// are numbered 1..N with `answerFormat: "WORKED_SOLUTION"` and
// populated `solutionSketch`.
//
// This package deliberately does not hit the network — it only loads
// and validates manifests. The downstream committer (admin.import
// tRPC / commitImportFromJson) handles DB inserts.

export {
  loadStepManifest,
  loadAllStepManifests,
  STEP_MANIFEST_DIR,
  type StepManifestLoadResult
} from "./load-manifest";
