# Real Content Import Spec

## 1. Goals and scope

### MVP goals
- Import real AMC/AIME-style problems into the existing tutor system using the current JSON preview/commit import flow.
- Standardize one canonical JSON file shape for contest problem sets.
- Enforce strict structural validation before import.
- Allow optional metadata enrichment on problems for tutor quality.
- Keep the system small enough for a solo founder plus agents to operate directly from the repository.

### Out of scope for MVP
- A multi-format importer.
- A generic ingestion platform.
- Raw-source archival as a default repository workflow.
- Separate normalization services or pipelines.
- Complex editorial tooling, approvals, or content versioning systems.
- Automatic topic/difficulty/hint generation as part of import.

## 2. Source inputs

MVP importer input is exactly one format: canonical JSON.

Possible upstream source materials may still exist operationally:
- manually prepared JSON
- CSV or spreadsheet export
- parsed text extracted from PDFs
- legacy scraped contest content

For MVP, none of those formats should be imported directly unless they have already been converted into the canonical JSON shape below.

### MVP rule
- The importer reads canonical JSON only.
- Any conversion from CSV, spreadsheet, PDF text, or legacy scraped content happens outside the importer and is not part of the MVP import design.

## 3. Canonical contest content schema

The canonical format should remain very close to the current repository import shape so it can flow through the existing preview/commit importer with minimal change.

### Canonical JSON shape

```json
{
  "problemSet": {
    "contest": "AMC12",
    "year": 2024,
    "exam": "A",
    "sourceUrl": "https://example.com/amc12-2024-a",
    "verifiedPdfUrl": "https://example.com/amc12-2024-a.pdf"
  },
  "problems": [
    {
      "number": 1,
      "statement": "Problem text here",
      "statementFormat": "MARKDOWN_LATEX",
      "choices": ["1", "2", "3", "4", "5"],
      "answer": "C",
      "answerFormat": "MULTIPLE_CHOICE",
      "topicKey": "algebra.polynomials",
      "difficultyBand": "MEDIUM",
      "solutionSketch": "Factor the expression and compare cases.",
      "curatedHintLevel1": "Look for a useful factorization.",
      "curatedHintLevel2": "Rewrite the expression before expanding.",
      "curatedHintLevel3": "A common factor appears after regrouping.",
      "sourceUrl": "https://example.com/amc12-2024-a#problem-1"
    }
  ]
}
```

### Required fields

#### `problemSet`
- `contest`
- `year`
- `exam` when required by contest

#### `problem`
- `number`
- `statement`
- `answer`
- `answerFormat`

### Optional fields

#### `problemSet`
- `sourceUrl`
- `verifiedPdfUrl`

#### `problem`
- `statementFormat`
- `choices`
- `topicKey`
- `difficultyBand`
- `solutionSketch`
- `curatedHintLevel1`
- `curatedHintLevel2`
- `curatedHintLevel3`
- `sourceUrl`

### Field guidance

#### `problemSet.contest`
- Allowed values: `AMC8 | AMC10 | AMC12 | AIME`

#### `problemSet.year`
- Integer contest year.

#### `problemSet.exam`
- `AMC8`: must be omitted or `null`
- `AMC10` and `AMC12`: must be `A` or `B`
- `AIME`: must be `I` or `II`

#### `problem.statementFormat`
- Allowed values: `MARKDOWN_LATEX | HTML | PLAIN`
- Recommendation: default to `MARKDOWN_LATEX`

#### `problem.choices`
- `string[]` only
- For multiple-choice problems, entries represent answer text in `A, B, C, D, E` order

#### `problem.answerFormat`
- Allowed values: `MULTIPLE_CHOICE | INTEGER | EXPRESSION`

#### Optional enrichment fields
- `topicKey`
- `difficultyBand`
- `solutionSketch`
- `curatedHintLevel1`
- `curatedHintLevel2`
- `curatedHintLevel3`

These are optional enrichment fields, not import blockers unless present and invalid.

### Importer persistence requirement

When any of the following optional problem fields are present in canonical JSON, the importer must accept and persist them to the existing `Problem` columns in `schema.prisma`:
- `topicKey`
- `difficultyBand`
- `solutionSketch`
- `curatedHintLevel1`
- `curatedHintLevel2`
- `curatedHintLevel3`

## 4. Recommended MVP import flow

MVP should reuse the current importer path already present in the repository.

### Flow
1. Prepare one canonical JSON file.
2. Run validation through the current preview step.
3. Review warnings and sample content.
4. Commit through the current importer.
5. Verify imported data in the app.

### What the importer should do
- Parse canonical JSON.
- Validate hard structural rules.
- Detect duplicate problem numbers in the file.
- Preview whether the problem set already exists.
- Upsert the problem set by `(contest, year, exam)`.
- Upsert problems by `(problemSetId, number)`.
- Update only changed fields.

### What MVP should not add
- No second import path.
- No separate normalization subsystem.
- No extra ingestion database tables.
- No generic batch orchestration layer beyond current scripts and importer usage.

## 5. Hard validation rules

Validation should be strict on structural invariants and conservative on optional enrichment.

### Problem set identity
- `contest` must be one of `AMC8 | AMC10 | AMC12 | AIME`
- `year` must be an integer
- `year` must be between `1950` and `currentYear + 1`
- `exam` rules:
  - `AMC8`: `exam` must be missing or `null`
  - `AMC10`: `exam` must be `A` or `B`
  - `AMC12`: `exam` must be `A` or `B`
  - `AIME`: `exam` must be `I` or `II`

### Problems array
- `problems` must exist
- `problems` must be a non-empty array
- problem count must match contest rules exactly:
  - `AMC8`, `AMC10`, `AMC12`: exactly 25 problems
  - `AIME`: exactly 15 problems
- duplicate `number` values in the same file are rejected

### Problem number
- `number` must be an integer
- `number` must be `>= 1`
- numbering must be contiguous and exactly match contest rules:
  - `AMC8`, `AMC10`, `AMC12`: numbered `1..25`
  - `AIME`: numbered `1..15`

### Statement
- `statement` must be present after trim
- whitespace-only statements are rejected
- obvious placeholder values such as `TBD` or `TODO` should be rejected

### Answer
- `answer` must be present after trim
- whitespace-only answers are rejected

### `answerFormat`
- must be one of `MULTIPLE_CHOICE | INTEGER | EXPRESSION`

### `statementFormat`
- if present, must be one of `MARKDOWN_LATEX | HTML | PLAIN`

### Multiple-choice rules
- if `answerFormat` is `MULTIPLE_CHOICE`:
  - `answer` must be exactly one of `A | B | C | D | E`
  - `choices` must be present
  - `choices` must be an array of exactly 5 strings
  - each choice must be non-empty after trim

### Integer answer rules
- if `answerFormat` is `INTEGER`:
  - `answer` must match a normalized integer string
  - `choices` must be absent

### Expression answer rules
- if `answerFormat` is `EXPRESSION`:
  - `answer` must be a non-empty string
  - `choices` must be absent

### Contest-format consistency
- `AMC8`, `AMC10`, `AMC12` problems should normally use `MULTIPLE_CHOICE`
- `AIME` problems should normally use `INTEGER`
- if a file violates this default expectation, preview should warn even if import remains structurally valid

### URLs
- if `problemSet.sourceUrl` is present, it must be a valid URL
- if `problemSet.verifiedPdfUrl` is present, it must be a valid URL
- if `problem.sourceUrl` is present, it must be a valid URL

### Optional enrichment validation

#### `topicKey`
- if present, must be trimmed and non-empty
- recommended convention: lowercase dot-separated key such as `geometry.similar_triangles`

#### `difficultyBand`
- if present, must be one of `EASY | MEDIUM | HARD`

#### `solutionSketch`
- if present, must be trimmed and non-empty

#### Curated hints
- if present, each hint must be trimmed and non-empty
- empty strings should be treated as invalid input, not useful content
- exact duplicate hint text across levels should be rejected

### Duplicate problem set detection
- canonical identity is `(contest, year, exam)`
- importing the same identity should upsert the existing set, not create a second set

## 6. Filtering and cataloging design

Imported real problems should be grouped using fields already close to the current product model.

### Required product filters
- `contest`
- `year`
- `exam`

### Optional product filters
- `topicKey`
- `difficultyBand`

### Real corpus vs seeded/demo content
- Keep this separation simple.
- Recommendation: use source of import and repository location to distinguish real imported corpus from seeded/demo content in MVP.
- Do not add a new generic cataloging abstraction unless product queries actually require it.

### Set generation readiness
- A problem is usable when it has:
  - valid problem set identity
  - valid `number`
  - valid `statement`
  - valid `answer`
  - valid `answerFormat`
- `topicKey`, `difficultyBand`, `solutionSketch`, and hints improve tutor quality but are not required for import.

## 7. Metadata enrichment design

Enrichment should stay optional and lightweight.

### Optional enrichment fields
- `topicKey`
- `difficultyBand`
- `solutionSketch`
- `curatedHintLevel1`
- `curatedHintLevel2`
- `curatedHintLevel3`

### MVP recommendation
- Import real problems even if enrichment is missing.
- Add enrichment only where it improves product value now.
- Prefer reviewed, human-readable values over ambitious taxonomy design.

### Practical guidance
- `topicKey`: useful for filtering and future set assembly
- `difficultyBand`: useful for sequencing
- `solutionSketch`: useful for tutor grounding
- curated hints: useful for high-value problems only

## 8. Import strategy recommendation

### Recommended MVP path
- Canonical JSON only.
- Use the current preview/commit importer.
- Do not expand importer input types.
- Do not build a parallel content-import stack.

### Why this is the right MVP choice
- It matches the existing repository architecture.
- It keeps implementation effort low.
- It keeps validation, preview, and commit in one place.
- It makes content review straightforward because each import file is plain JSON.

## 9. Repository/file organization

Keep organization minimal.

```text
packages/db/data/real-imports/
scripts/
  validate-real-content.ts
```

### Recommendation
- Store canonical JSON files under `packages/db/data/real-imports/`
- Reuse existing importer code and admin preview/commit flow
- Add only a small validation helper script if needed

### Naming
- File naming should be deterministic:
  - `AMC8_2024.json`
  - `AMC10_2024_A.json`
  - `AMC12_2024_B.json`
  - `AIME_2024_I.json`

## 10. Operational workflow

This workflow is optimized for a solo founder plus agents.

### 1. Prepare content
- Create or edit one canonical JSON file in `packages/db/data/real-imports/`
- Keep one file per contest set

### 2. Validate
- Run the current preview flow or a small validation script
- Fix all hard validation failures before import

### 3. Enrich if useful
- Add `topicKey`, `difficultyBand`, `solutionSketch`, or hints only when valuable
- Do not block import on missing enrichment

### 4. Import
- Use preview first
- Then commit through the current importer

### 5. Verify
- Open the imported set in the app
- Check problem count, sample statements, answers, and filters

### Collaboration pattern
- Founder or one agent prepares the canonical file
- Another agent can review structure and enrichment
- Import remains a single clear handoff through preview/commit

## 11. MVP-only decisions

The following are intentionally not supported now:
- direct CSV import
- direct spreadsheet import
- direct PDF-text import
- direct legacy-scrape import
- a raw-source repository archive as default workflow
- a generic normalization pipeline
- multiple canonical content formats
- richer choice objects
- problem-level canonical IDs
- problem-set titles in import payload
- broad provenance metadata beyond optional source URLs
- required enrichment metadata
- a new parallel importer beside the current preview/commit path

These decisions are intentional simplifications, not missing features.

## 12. Risks and cleanup guidance

### Main risks
- copyright and licensing uncertainty around real contest material
- malformed or incomplete upstream source data before it reaches canonical JSON
- inconsistent optional tags like `topicKey` and `difficultyBand`
- silent quality issues in statements or answers that are structurally valid

### Cleanup guidance
- keep one canonical JSON shape
- keep validation strict
- keep enrichment optional
- keep file layout minimal
- reuse the current importer
- avoid new abstractions until there is clear repeated pain

## Summary recommendation

The MVP should be a strict JSON-only import workflow:

1. prepare one canonical JSON file
2. preview and validate it using the current importer path
3. commit it through the existing upsert flow
4. verify it in the app

This is the smallest design that fits the current repository and product stage.

## 13. Implementation readiness checklist

- canonical JSON shape is fixed and documented
- optional tutor metadata fields are explicitly importable and persisted
- hard validation rules define exact set sizes and numbering
- `difficultyBand` values are fixed to `EASY | MEDIUM | HARD`
- repository location for canonical files is fixed
- workflow reuses the existing preview/commit importer path
