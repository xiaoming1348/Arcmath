# Real-exam content gap audit (2026-05-21)

Target: **each Contest enum value should have ≥ 6 real-exam ProblemSets**
in the public library, so /problems shows a non-trivial browser per track.

## Current state

Counted by raw JSON manifest / canonical import files on disk
(`packages/db/data/real-imports/*.json` and
`packages/ingest-*/src/manifests/*.json`). DB state may differ if the
import scripts haven't been re-run.

| Contest  | Files | Target | Gap | Source dir                                          |
|----------|-------|--------|-----|------------------------------------------------------|
| AMC8     | 7     | 6      |  ✓  | `packages/db/data/real-imports/AMC8_*.json`         |
| AMC10    | 8     | 6      |  ✓  | `packages/db/data/real-imports/AMC10_*.json`        |
| AMC12    | 8     | 6      |  ✓  | `packages/db/data/real-imports/AMC12_*.json`        |
| AIME     | 8     | 6      |  ✓  | `packages/db/data/real-imports/AIME_*.json`         |
| EUCLID   | 10    | 6      |  ✓  | `packages/ingest-cemc/src/manifests/euclid-*.json`   |
| PUTNAM   | 5     | 6      | +1  | `packages/ingest-maa-putnam/src/manifests/`          |
| MAT      | 5     | 6      | +1  | `packages/ingest-oxford-mat/src/manifests/`          |
| USAMO    | 3     | 6      | +3  | `packages/ingest-maa-usamo/src/manifests/`           |
| STEP     | 3     | 6      | +3  | `packages/ingest-cambridge-step/src/manifests/`      |
| USAJMO   | 0     | 6      | +6  | *(no package yet — needs `ingest-maa-usajmo`)*       |
| IMO      | 0     | 6      | +6  | *(no package yet — needs `ingest-imo`)*              |
| CMO      | 0     | 6      | +6  | *(no package yet)*                                    |

Total new manifests needed: **26 files** to fully reach the target.

## Years missing for the partial tracks

(Pick from the gaps below when authoring.)

- **PUTNAM** — have 2019, 2021, 2022, 2023, 2024. Missing: **2018**
  (Putnam 2020 was cancelled due to COVID, so skip it.) Source:
  https://kskedlaya.org/putnam-archive/
- **MAT** — have 2019, 2020, 2021, 2022, 2023. Missing: **2024**
  (released Nov 2024). Source: https://www.maths.ox.ac.uk/study-here/undergraduate-study/maths-admissions-test
- **USAMO** — have 2017, 2019, 2020. Missing: **2018, 2021, 2022, 2023, 2024**
  (any three). Source: https://artofproblemsolving.com/wiki/index.php/USAMO_Problems_and_Solutions
- **STEP** — have 2020-II, 2022-II, 2023-II. Missing: **2019-II, 2021-II, 2024-II**
  (plus STEP III papers if we want depth). Source: https://www.admissionstesting.org/for-test-takers/step/preparing-for-step/

## How to add a real-exam set

1. Author a JSON file matching `importProblemSetSchema` (see
   `packages/shared/src/import-schema.ts`). Use Putnam 2019 / Euclid 2024
   manifests as templates.
2. Each problem needs:
   - `number` (1-based)
   - `statement` (MARKDOWN_LATEX)
   - `answerFormat` (`INTEGER` | `EXPRESSION` | `MULTIPLE_CHOICE` | `WORKED_SOLUTION` | `PROOF`)
   - `answer` (for non-WORKED_SOLUTION / non-PROOF)
   - `topicKey` (dot.separated.taxonomy key)
   - `techniqueTags` (string array)
   - `difficultyBand` (`EASY` | `MEDIUM` | `HARD`)
   - `solutionSketch` (markdown, ideally 100-400 words with the
     critical insight + answer)
3. Place under the appropriate ingest package's `src/manifests/` or
   `packages/db/data/real-imports/`.
4. Validate locally: `pnpm real-import:audit`.
5. Run import on prod: `pnpm -F @arcmath/* tsx scripts/run-real-import.ts
   commit --file packages/db/data/real-imports/NEW_FILE.json`
   (or per-package CLI for ingest-* packages).

## Risk: content accuracy

Hand-authoring competition problems from memory is **error-prone** —
problem statements and especially answer keys must be verified
against the official source PDF or the AoPS wiki. We do NOT want
students hitting wrong answer keys in production.

Two safer paths:
1. Use the `ingest-aops` package's `warm-cache` and `fetch` commands
   to pull statements + (where available) answers programmatically.
2. Use the teacher-upload flow: write a minimal manifest with just
   `problemSet` metadata + a `sourceUrl`, attach the official PDF, and
   author problems via the in-app teacher rubric editor.

## Recommended pilot priority order

For B1 (individual Chinese students prepping for US college admission):
1. AMC / AIME — DONE (≥ 6 each)
2. USAMO — bring to ≥ 6 (US olympiad path)
3. Putnam — bring to ≥ 6 (university-level)

For B2 (international schools):
1. Euclid — DONE
2. MAT — bring to 6 (Oxford/Imperial path)
3. STEP — bring to 6 (Cambridge path)

USAJMO / IMO / CMO can wait for v2; pilot doesn't include those tracks.
