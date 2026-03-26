# Content Library Plan

This document is the working plan for the next major content expansion. It defines the target library shape before we keep importing or seeding more material.

## 1. Diagnostic Sets

Each exam track should eventually have **three** diagnostic sets:

- `Preparation Start`
- `Preparation Middle`
- `Preparation Late`

Each diagnostic set should:

- contain `15` problems
- cover the full first-level topic scope of that exam
- be submitted as a whole set
- hide answers until the entire set is submitted
- disable the interactive Hint Tutor during the test
- produce a report plus score history that can be tracked over time

### Diagnostic sourcing rule

Diagnostic problems should be sourced from **real pre-2015 contest problems only** for now.

Current rule:

- prefer AMC/AIME real problems from before `2015`
- do **not** reuse the same source problem across different diagnostic sets
- every adopted source problem must be recorded with a unique source key

Recommended source-key format:

- `AMC8-2008-NA-P12`
- `AMC10-2011-A-P7`
- `AMC12-2014-B-P18`
- `AIME-2010-I-P5`

The repository now includes a dedicated audit command for this:

```bash
pnpm diagnostic:audit-sources
```

This will flag:

- any diagnostic problem whose source is not a real pre-2015 contest problem
- any source problem reused across multiple diagnostic sets

### Difficulty progression

- `Preparation Start`: `7 EASY / 6 MEDIUM / 2 HARD`
- `Preparation Middle`: `5 EASY / 6 MEDIUM / 4 HARD`
- `Preparation Late`: `3 EASY / 6 MEDIUM / 6 HARD`

The purpose is not to make every set feel the same. The early set measures baseline readiness, while the late set should feel closer to the real contest ceiling.

## 2. Real Exam Sets

Target:

- import **all real AMC/AIME sets from 2015 onward**
- review every imported set for:
  - statement display
  - choice display
  - image/diagram coverage
  - answer correctness
  - hint correctness
  - whole-set submit flow

Product behavior:

- no Hint Tutor during the timed whole-set experience
- no answer reveal after each individual problem
- submit once at the end
- compare all submissions against the answer key
- generate score and report
- store completion and score on the home view and in organization/admin records

## 3. Topic Practice Sets

Topic practice sets are separate from diagnostics and real exams.

They should:

- focus on a single topic or subtopic
- contain roughly `15-20` problems
- use a difficulty ratio of `4:3:3` for `EASY:MEDIUM:HARD`
- support the current per-problem Hint Tutor flow
- allow students to work problem-by-problem instead of whole-set submission

Examples:

- number theory: remainders
- plane geometry: circles
- counting: casework
- algebra: equations and manipulation

Source pool can include:

- pre-2015 real contests
- other AoPS-available competition problems

## 4. Product Modes

This plan implies three product modes:

1. `Diagnostic`
   - whole-set submit
   - no tutor
   - score + report + progress tracking

2. `Real Exam`
   - whole-set submit
   - no tutor during test-taking
   - score + report + admin visibility

3. `Topic Practice`
   - per-problem interaction
   - Hint Tutor enabled
   - targeted skill-building

The codebase should move toward explicit configuration for these modes rather than relying on `sourceUrl` checks or other ad hoc branching.

## 5. Recommended Implementation Order

1. Introduce explicit set-mode metadata and whole-set submit behavior.
2. Expand diagnostics from `1` to `3` stages per exam.
3. Import and QA the full 2015+ real-exam library.
4. Add topic-practice set metadata and entry points.
5. Add progress/status surfaces on the student home view and organization admin views.

## 6. Current Priority

Immediate next work should focus on:

1. explicit catalog/set-mode metadata
2. diagnostic expansion to `3 x 15` per exam
3. real-exam ingestion + QA for the 2015+ range

Only after those are stable should topic-practice set production accelerate.
