# ArcMath (AMC Platform) - MVP-0

## Stack
- `apps/web`: Next.js App Router + TypeScript + Tailwind + NextAuth Credentials + tRPC
- `packages/db`: Prisma schema/client/seed
- `packages/shared`: shared Zod/RBAC/import schemas
- `packages/ingest-aops`: AoPS wiki downloader + cached JSON generator
- PostgreSQL: Docker Compose (`postgres:16-alpine`)

## Workspace layout
- `apps/web`
- `packages/db`
- `packages/shared`
- `packages/ingest-aops`

## Environment
Copy env file:

```bash
cp .env.example .env
```

For production, use `env.production.example` as the baseline and configure secrets in your deployment platform.

Set `NEXTAUTH_SECRET` to a real value (required):

```bash
openssl rand -base64 32
```

Paste the output into `.env` as `NEXTAUTH_SECRET="..."`

Canonical local setup uses Docker Postgres on host port `5433`:
- `postgresql://postgres:postgres@localhost:5433/arcmath?schema=public`

If you prefer local Postgres (no Docker), use `5432` and your local credentials.

## Zero-to-run
Development bootstrap (uses `migrate dev`):

```bash
docker compose up -d
pnpm i
pnpm -F @arcmath/db prisma migrate dev
pnpm -F @arcmath/db prisma db seed
pnpm dev
```

Open `http://localhost:3000`.

## Local env choice

Use the script that matches the database you intend to hit:

- `pnpm dev`: prefers root `.env.local` when present, so local testing uses Neon by default.
- `pnpm dev:local`: loads root `.env` and is meant for local Docker/local Postgres development.
- `pnpm dev:neon`: loads root `.env.local` safely and runs the app against Neon.

For the current env-file architecture and exact script/file mapping, see [ENV_SETUP.md](/Users/yimingsun/Desktop/Arcmath/ENV_SETUP.md).

For the planned exam placement / diagnostic flow, see [DIAGNOSTIC_BLUEPRINT.md](/Users/yimingsun/Desktop/Arcmath/DIAGNOSTIC_BLUEPRINT.md).

Why this matters:
- newer tutor features depend on recent Prisma migrations (`topicKey`, `difficultyBand`, `solutionSketch`, curated hints, `PracticeRun`)
- if your local Postgres has not been migrated up, `/problems` routes can fail with Prisma `P2022 column does not exist`
- using `pnpm dev` or `pnpm dev:neon` avoids that drift when `.env.local` points at the up-to-date Neon database

Neon helpers:

```bash
pnpm migrate:neon
pnpm seed:neon
pnpm dev:neon
pnpm hint:precompute:neon -- --problem-set-id <problemSetId>
```

Do not `source .env.local` directly in shell when `DATABASE_URL` contains `&...` query params; use the scripts above instead.

## Hint Tutor AI config

The Hint Tutor server uses OpenAI when `OPENAI_API_KEY` is set.

- Required for real AI responses: `OPENAI_API_KEY`
- Optional overrides:
  - `OPENAI_MODEL` (defaults to `gpt-4.1-mini`)
  - `OPENAI_BASE_URL` (defaults to `https://api.openai.com/v1/responses`)

If `OPENAI_API_KEY` is missing or the model response cannot be parsed, the app falls back to safe server-side placeholder hints/explanations so the route still works.

Hint generation path for `"I'm stuck"` is:
- curated hints on `Problem`
- precomputed generated hints on `Problem`
- live OpenAI generation as the final fallback

Use `pnpm hint:precompute:neon -- --problem-set-id <problemSetId>` to precompute level 1/2/3 hints for a tutor-ready set without coupling that work to the import transaction.

## Real import quality workflow

For real contest sets, keep one canonical JSON file under `packages/db/data/real-imports/` as the source of truth, then run the shared quality pass before preview/commit:

```bash
pnpm real-import:refresh-quality --file packages/db/data/real-imports/<SET>.json
pnpm real-import:audit
pnpm real-import:run preview --file packages/db/data/real-imports/<SET>.json
pnpm real-import:run commit --file packages/db/data/real-imports/<SET>.json
pnpm hint:precompute:neon -- --problem-set-id <problemSetId>
```

What the quality pass currently does:
- normalizes noisy multiple-choice text extracted from AoPS/PDF sources
- applies a baseline `difficultyBand` to every problem
- infers coarse `topicKey` values when the statement is clear enough
- reapplies the shared per-set image/choice overrides used by the real-import builders

Use `pnpm real-import:audit` after refresh to see remaining gaps such as likely figure-dependent problems or missing tutor metadata.

For diagnostic readiness, use:

```bash
pnpm diagnostic:audit-pools
```

This audits the current real-import corpus against the deterministic `AMC8 / AMC10 / AMC12` diagnostic blueprints and reports whether the repo can already assemble a full `4 EASY / 4 MEDIUM / 2 HARD` first-pass placement test for each exam.

## Dev auth credentials
Seed creates a development admin user:
- Email: `admin@arcmath.local`
- Password: `Admin12345!`

This is dev-only and should not be used in production.

## E2E acceptance test
The repository now includes a first Playwright acceptance test for the AI Hint Tutor MVP at `apps/web/tests/e2e/ai-hint-tutor.spec.ts`.

Run it from the repo root:

```bash
pnpm test:e2e
```

What it covers:
- opens the app
- provisions a fresh test student through `/api/register`
- logs in through the real `/login` form
- opens `/problems`
- verifies the seeded `Hint Tutor MVP Seed Set`
- opens a seeded problem
- requests a hint
- submits an answer and verifies the explanation UI
- opens `/reports` and verifies the report is populated

Local assumptions:
- the app can start with `pnpm dev`
- Postgres is running and migrations have been applied
- `pnpm db:seed` has been run so `Hint Tutor MVP Seed Set` exists
- Playwright browser binaries are installed locally; if needed, run `pnpm -C apps/web exec playwright install chromium`

The E2E flow does not require `OPENAI_API_KEY`; Hint Tutor falls back to safe local responses when that key is absent.

## Auth + RBAC behavior
- Protected routes: `/dashboard`, `/problems`, `/assignments`, `/resources`, `/membership`, `/admin`
- If unauthenticated: redirect to `/login`
- If non-admin opens `/admin*`: redirect to `/dashboard`

## Resource access model (membership placeholder)
- `/resources` contains AMC/AIME archives.
- Non-admin users get **3 free downloads** (any three files they choose).
- Quota is consumed only when clicking the download endpoint.
- Searches/filtering do not consume quota.
- After 3 used downloads, additional new files are locked behind `/membership` (placeholder page).
- Admin users can view all resources.

### Last-10 complete years scope
Resources are dynamically scoped to the **last 10 complete years**:
- `yearTo = currentYear - 1`
- `yearFrom = yearTo - 9`

As of **March 5, 2026**, this resolves to **2016-2025**.

### Resource PDF behavior
- Storage driver is selected by `OFFICIAL_PDF_STORAGE_DRIVER`:
  - `local` (default): store PDFs under local filesystem cache.
  - `s3`: store PDFs in S3-compatible object storage and serve via short-lived presigned redirects.

S3 env (required when driver=`s3`):
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

S3 env (optional):
- `S3_ENDPOINT`
- `S3_KEY_PREFIX`
- `S3_FORCE_PATH_STYLE=true|false`

- Generated PDF flow is the primary product path.
- `/resources` only shows in-scope combinations that are already downloadable for both variants (`problems` and `answers`).
- Downloads follow this order:
  1. Serve cached PDF from configured storage driver when present:
     - `local`: stream PDF attachment from server.
     - `s3`: redirect to short-lived presigned URL.
  2. If cache is missing, generate PDF from stored `Problem` text and cache it.
  3. If generation is not possible, return HTTP `409`.
- Variant endpoints:
  - `/api/resources/pdf?id=<problemSetId>&variant=problems`
  - `/api/resources/pdf?id=<problemSetId>&variant=answers`
- Admin can generate/cache directly from stored problems (no external URL required) from `/admin`.
- Official-link tools are retained only as deprecated manual fallback.
- Cache metadata is persisted on `ProblemSet`:
  - `cachedPdfPath`, `cachedPdfSha256`, `cachedPdfSize`, `cachedPdfAt`
  - `cachedPdfStatus` (`CACHED` | `FAILED` | `MISSING`)
  - `cachedPdfError` (short last error text)
- `/admin` shows cache coverage plus generation readiness stats (`generatable`, `needsGeneration`, `noProblem`).

### One-command bootstrap (recommended)
Primary pipeline for downloadable papers (generated PDFs):
1. fetch AoPS JSON into one output directory
2. bulk import JSON into DB
3. generate/cache PDFs from stored problem text

Full run:

```bash
pnpm papers:bootstrap-generated --output-dir ingest/aops-imports --contest AMC10,AMC12,AIME --year-from 2005 --year-to 2025 --limit 200
```

Dry-run planning (plan-only; no child command execution):

```bash
pnpm papers:bootstrap-generated --output-dir ingest/aops-imports --contest AMC12 --year-from 2010 --year-to 2025 --limit 50 --dry-run
```

In bootstrap dry-run, no fetch/import/generate subprocess is executed. The command only emits the plan and writes summary JSON.

Resume workflow examples:

```bash
# skip fetch when JSON already exists
pnpm papers:bootstrap-generated --output-dir ingest/aops-imports --skip-fetch --year-from 2005 --year-to 2025

# retry only failed generated-cache rows
pnpm papers:bootstrap-generated --output-dir ingest/aops-imports --skip-fetch --skip-import --retry-failed-only --max-errors 10
```

Bootstrap summary JSON:
- default: `<output-dir>/bootstrap-generated-summary.json`
- override: `--summary-out <path>`
- includes step-level command, exit code, status, `planned`, `executed`, and `skipReason`, plus overall pipeline status.

### Production materialization (last 10 complete years)
Use this command to materialize the full in-scope catalog end-to-end:
1. scoped AoPS fetch/import
2. problems-PDF generation backfill
3. answers-PDF generation backfill
4. searchable/downloadable validation

```bash
pnpm papers:materialize-last10 --output-dir tmp/last10-materialize
```

Optional DB override for Docker port `5433`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/arcmath?schema=public pnpm papers:materialize-last10 --output-dir tmp/last10-materialize
```

Summary artifact:
- default: `<output-dir>/materialize-last10-summary.json`
- imports are stored under: `<output-dir>/imports`
- validation artifacts are stored under: `<output-dir>/validation`

Validation command (standalone):

```bash
pnpm pdf:validate-searchable --out-dir tmp/last10-materialize/validation
```

### Scoped AoPS import (standalone)
Use import filters directly when you need narrow DB ingestion:

```bash
pnpm aops:import --dir ingest/aops-imports --contest AMC12 --year-from 2010 --year-to 2025 --limit-files 100
```

Dry-run preview (no DB writes):

```bash
pnpm aops:import --dir ingest/aops-imports --contest AMC12 --year-from 2010 --year-to 2025 --dry-run
```

Import summary now includes:
- `filesMatched`
- `filesSkippedByFilter`
- `filesSkippedByLimit`
- existing created/updated/skipped counters
- dry-run mode indicator

### Generated PDF backfill (DB problem text -> cache)
Use this directly when fetch/import are already done and only generation is needed.

Internal note: route fallback generation, admin one-click generation, and generated backfill now use one shared generation/cache service for consistent status/error metadata handling.

Admin UI workflow (no CLI):
1. Login as admin and open `/admin`.
2. Use **Generate PDF From Stored Problems** for one set.
3. Use **Batch Generate PDFs (Stored Problems)** for scoped runs (`contest`, `yearFrom`, `yearTo`, `limit`, `dryRun`, `retryFailedOnly`, `maxErrors`).
4. Review summary counters in the panel (`generated_cached`, `skipped_no_problems`, `render_failed`, `cache_failed`).

```bash
pnpm pdf:backfill-generated --limit 100 --contest AMC12 --year-from 2005 --year-to 2025
```

Dry-run (no DB/file writes):

```bash
pnpm pdf:backfill-generated --dry-run --limit 100
```

Retry previously failed sets with failure cap:

```bash
pnpm pdf:backfill-generated --retry-failed-only --max-errors 10 --limit 200
```

Expected summary output includes:
- `scanned`
- `generated_cached`
- `skipped_already_cached`
- `skipped_no_problems`
- `render_failed`
- `cache_failed`
- `aborted`

### PDF render verification (quality gate)
Use this to generate both variants for one set and verify text quality with Ghostscript extraction checks.

```bash
pnpm pdf:render-verify --contest AMC12 --year 2025 --exam A --out-dir tmp/pdf-verify
```

The command writes:
- `<out-dir>/AMC12_2025_A_problems.pdf`
- `<out-dir>/AMC12_2025_A_answers.pdf`
- `<out-dir>/AMC12_2025_A_verify.json`

Checks include:
- expected `Problem N` marker counts (AMC: 25, AIME: 15)
- TeX leakage threshold (`$`, `\\frac`, `\\sqrt`, `\\textbf`, etc.)
- last page contains non-whitespace text (blank-page regression guard)

### Single paper from topic URL
Use this when one AoPS paper is failing and you want the narrowest possible end-to-end path before running larger batch jobs.

This command:
1. fetches one AoPS community topic URL
2. parses one import JSON payload
3. imports that one paper into the DB
4. generates and caches one local PDF from stored problem text
5. writes a summary JSON with the exact artifact paths

```bash
pnpm paper:from-topic-url --url https://artofproblemsolving.com/community/c3198872_2025_amc_12ahsme --work-dir tmp/one-paper
```

Dry-run preview (fetch + parse + import preview only; no DB writes, no PDF generation):

```bash
pnpm paper:from-topic-url --url https://artofproblemsolving.com/community/c3198872_2025_amc_12ahsme --work-dir tmp/one-paper --dry-run
```

Artifacts:
- import JSON: `<work-dir>/imports/<contest>_<year>_<exam>.json`
- summary JSON: `<work-dir>/summary.json`

If generation succeeds in normal mode and `OFFICIAL_PDF_STORAGE_DRIVER=local`, the summary also includes the exact cached local PDF path under the configured cache root.

Safety rule for unsupported legacy naming:
- if the topic clearly resolves to `AMC12A` or `AMC12B`, it is stored as `contest=AMC12`, `exam=A|B`
- if the topic only says `AHSME` / `AMC 12 AHSME` without a clean `A|B` mapping, the command fails instead of guessing

### Optional deprecated legacy official-link tooling
Official-link resolver/backfill remains available only for manual fallback operations.

```bash
pnpm pdf:backfill:legacy-official --limit 100 --contest AMC12 --year-from 2005 --year-to 2025
```

Run without writing DB/files:

```bash
pnpm pdf:backfill:legacy-official --dry-run --limit 100
```

Retry only previously failed sets, aborting once failures exceed threshold:

```bash
pnpm pdf:backfill:legacy-official --retry-failed-only --max-errors 10 --limit 200
```

Override local cache directory:

```bash
OFFICIAL_PDF_CACHE_DIR=/absolute/path/to/cache pnpm pdf:backfill:legacy-official --limit 100
```

Backfill against S3-compatible storage:

```bash
OFFICIAL_PDF_STORAGE_DRIVER=s3 pnpm pdf:backfill:legacy-official --limit 100
```

### Troubleshooting
- DB connection mismatch is the most common runtime issue.
- If commands fail with `localhost:5432` but Docker is mapped to `5433`, update `DATABASE_URL` in `.env` to use `5433`:
  `postgresql://postgres:postgres@localhost:5433/arcmath?schema=public`

## Production Deployment
Use this runbook for company website rollout.

1. Prepare env:
   - copy `env.production.example` values into deployment secrets/config.
   - use `OFFICIAL_PDF_STORAGE_DRIVER=s3` in production.
2. Preflight:

```bash
pnpm preflight:production
```

3. Migrate before app rollout:

```bash
pnpm db:status
pnpm db:migrate:deploy
```

4. First-time materialization:

```bash
pnpm papers:materialize-last10 --output-dir tmp/last10-materialize
pnpm pdf:validate-searchable --out-dir tmp/last10-materialize/validation
```

5. Rollback approach:
   - application rollback first (deploy previous app image/version).
   - DB rollback uses forward-fix migration policy; do not run ad-hoc destructive SQL in prod.
6. Backup/restore expectations:
   - enable regular Postgres backups (daily + PITR/WAL if available).
   - test restore to staging before production cutover.
7. Storage lifecycle policy:
   - configure bucket/object lifecycle retention for generated PDFs according to compliance requirements.

## Contest import JSON format
Upload this shape in `/admin/import`:

```json
{
  "problemSet": {
    "contest": "AMC10",
    "year": 2022,
    "exam": "A",
    "sourceUrl": "https://example.com/amc10a-2022",
    "verifiedPdfUrl": "https://example.com/amc10a-2022.pdf"
  },
  "problems": [
    {
      "number": 1,
      "statement": "Problem text here",
      "statementFormat": "MARKDOWN_LATEX",
      "choices": ["A", "B", "C", "D", "E"],
      "answer": "C",
      "answerFormat": "MULTIPLE_CHOICE",
      "sourceUrl": "https://example.com/amc10a-2022#1"
    }
  ]
}
```

Validation rules:
- `contest`: `AMC8 | AMC10 | AMC12 | AIME`
- `year`: `1950..(currentYear+1)`
- exam rules:
  - `AMC8`: exam must be omitted/null
  - `AMC10`/`AMC12`: exam must be `A` or `B`
  - `AIME`: exam must be `I` or `II`
- `problems` must be non-empty
- duplicate `problem.number` in the same file is rejected
- empty/whitespace `statement` and `answer` are normalized to missing values

## Import flow
1. Login as admin (`admin@arcmath.local` / `Admin12345!`).
2. Open `/admin/import`.
3. Upload `.json` file.
4. Click `Preview` to validate and inspect impact.
5. Click `Commit` to upsert transactionally.
6. Use the success link to open `/resources` with query filters.

Notes:
- Import is idempotent: re-import does not create duplicates.
- Existing problems are updated only when incoming fields differ.
- Import jobs are recorded in DB with `PENDING/SUCCESS/FAILED`.

## AoPS fetch + import tools
Generates import-ready AMC/AIME JSON files from AoPS wiki pages with local caching.

```bash
pnpm -F @arcmath/ingest-aops warm-cache --contest AMC12 --year 2025 --exam A
pnpm -F @arcmath/ingest-aops fetch --contest AMC12 --year 2025 --exam A --out ingest/json/amc12_2025_a.json
pnpm ingest:fetch-pdf --contest AMC12 --year 2025 --exam A --out-dir ingest/artifacts --strict-match
pnpm ingest:fetch-pdf-batch --manifest ingest/official-pdf-manifest.json --out-dir ingest/artifacts --skip-existing --continue-on-error --strict-match
```

Cache and reproducibility options:
- `--cache-dir <path>` custom cache location (default `packages/ingest-aops/.cache` when run in that package)
- `--cache-only` use cached pages only, fail on cache miss
- `--refresh` force re-download
- `--concurrency 3` and `--delay-ms 300` control pacing
- `--max-empty-statements 0` fail fetch if parsed statements are missing/too short
- `--strict-match` (single + batch official PDF fetch): guard against wrong-paper downloads by checking contest/year/exam tokens across URL/filename/reference pages

Output JSON is validated against `importProblemSetSchema` and includes:
- `statement` (required by quality gate, command fails when too many are empty)
- `statementFormat: "MARKDOWN_LATEX"`
- `choices` when A/B/C/D/E blocks are detected
- answers from AoPS answer-key page

Official PDF fetch output files:
- `<out-dir>/<contest>_<year>_<exam-or-none>_official.pdf`
- `<out-dir>/<contest>_<year>_<exam-or-none>_official.meta.json`

Official metadata includes:
- `contest`, `year`, `exam`
- `baseTitle`
- `examWikiUrl`
- `discoveredFrom`
- `pdfUrl`
- `sha256`
- `size`
- `fetchedAt`

Batch manifest format (`ingest/official-pdf-manifest.json`):

```json
[
  { "contest": "AMC12", "year": 2025, "exam": "A", "label": "amc12-2025-a" },
  { "contest": "AMC12", "year": 2025, "exam": "B" },
  { "contest": "AMC8", "year": 2024, "exam": null }
]
```

Batch command notes:
- `--manifest <path>` and `--out-dir <path>` are required.
- `--summary-out` defaults to `<out-dir>/official-pdf-batch-summary.json`.
- `--concurrency` is `1..5` (default `2`).
- `--limit <n>` truncates manifest processing to first `n` entries.
- `--skip-existing` resumes safely by skipping entries that already have both `.pdf` and `.meta.json`.
- `--continue-on-error` records failures and proceeds; without it, batch stops on first failure.

Batch summary JSON fields:
- `startedAt`, `finishedAt`
- `totals.requested`, `totals.processed`, `totals.succeeded`, `totals.failed`, `totals.skippedExisting`
- `items[]` with identity, `status`, `pdfPath/metaPath` on success/skip, and `error` on failure

Then import the produced JSON with `/admin/import` (Preview -> Commit).

## tRPC procedures
- `healthcheck` (public)
- `currentUser` (public)
- `listClasses` (protected, currently empty)
- `admin.import.preview` (admin)
- `admin.import.commit` (admin)
- `resources.list` (protected)
- `resourceSets.listDistinctFilters` (protected)
- `problems.list` (protected)
- `problemSets.listDistinctFilters` (protected)

## Tests
```bash
pnpm test
```

Expected:
- `packages/shared/src/rbac.test.ts` passes
- `packages/shared/src/import-schema.test.ts` passes
- `apps/web/src/lib/trpc/router.test.ts` passes
- `apps/web/src/lib/trpc/admin-import-router.test.ts` passes

## Acceptance checklist
- [ ] Login with `admin@arcmath.local / Admin12345!`
- [ ] Open `/admin/import` as admin
- [ ] Upload valid JSON and preview succeeds
- [ ] Commit succeeds and reports created/updated/skipped counts
- [ ] Re-import same JSON and duplicates are not created
- [ ] Open `/resources` filter link and verify imported set/problems render
- [ ] Login as non-admin and verify quota is consumed only on download click (not search)
- [ ] After 3 unique downloads, verify new file downloads are locked
