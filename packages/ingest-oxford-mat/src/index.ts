// Mathematics Admissions Test (Oxford / Imperial) ingest.
//
// The MAT is a 2.5-hour paper used for admissions to maths-heavy courses
// at Oxford and (historically) Imperial. The exam has had two formats:
//
// - Legacy (through the 2022 sitting): Q1 has 10 multiple-choice
//   subparts (A–J), each worth 4 marks (total 40). Q2–Q7 are six long
//   "show that…" / multi-part questions worth 15 marks each (total 90).
//   Candidates answer Q1 plus four of Q2–Q7 depending on their
//   intended course, but the content is the same paper.
// - Newer format (post-2022 sittings — Oxford paused MAT in 2024 in
//   favour of TMUA and is reintroducing it 2025): closer to an all
//   multiple-choice paper. We do not yet ship manifests for the new
//   format; legacy years are the admissions-track focus for our
//   pilot international-school cohort.
//
// ## Why manifests instead of scraping
//
// The MAT past papers and examiners' reports are distributed as PDFs
// on the Oxford Mathematical Institute website. For our pilot we want
// a deterministic, reviewable ingestion path: a JSON manifest per
// paper year, hand-transcribed from the official PDF, validated
// against `@arcmath/shared/importProblemSetSchema`. This:
//
// - keeps every LaTeX fragment reviewable in code review
// - lets us attach topicKey / techniqueTags / curated hints that
//   scraping can't produce
// - avoids any re-distribution-of-PDFs concerns while keeping the
//   per-problem text faithful to the source (short excerpts for
//   teaching use, with full attribution back to the Oxford paper)
//
// ## Problem layout we encode
//
// We flatten Q1 subparts as separate MULTIPLE_CHOICE problems numbered
// 1 through 10 (so a student can practise subpart A in isolation). The
// long questions Q2–Q7 become problems 11 through 16 with
// `answerFormat: "WORKED_SOLUTION"`; the `solutionSketch` carries the
// official examiner's-report solution and the per-part final answers.
// This matches how teachers actually assign MAT problems — Q1 for
// timed drill, Q2–Q7 for focused "sit with it" practice.
//
// This package deliberately does not hit the network — it only loads
// and validates manifests. The downstream committer (admin.import
// tRPC / commitImportFromJson) handles DB inserts.

export {
  loadMatManifest,
  loadAllMatManifests,
  MAT_MANIFEST_DIR,
  type MatManifestLoadResult
} from "./load-manifest";
