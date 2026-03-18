# Environment Setup

This repo currently uses two local environment file roles:

- `.env`: local Postgres / Docker-oriented workflow
- `.env.local`: Neon-backed local development workflow

The important detail is that they are not interchangeable today.

## What Each File Is For

### `.env`

Use `.env` when you explicitly want to run against a local Postgres instance.

Typical use cases:
- `pnpm dev:local`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:migrate:deploy`
- `pnpm db:status`
- `pnpm db:seed`
- `pnpm db:studio`
- importer/backfill/materialization scripts that still source `.env`

Recommended source template:
- copy from [`.env.example`](/Users/yimingsun/Desktop/Arcmath/.env.example)

### `.env.local`

Use `.env.local` when you want local Next.js development against Neon.

Typical use cases:
- `pnpm dev`
  - prefers `.env.local` when the file exists
- `pnpm dev:neon`
- `pnpm seed:neon`
- `pnpm migrate:neon`
- direct usage of [`scripts/with-env-local.sh`](/Users/yimingsun/Desktop/Arcmath/scripts/with-env-local.sh)

Recommended source template:
- copy from [`.env.local.example`](/Users/yimingsun/Desktop/Arcmath/.env.local.example)

## Which Scripts Read Which File

### Scripts that use `.env.local`

- `pnpm dev`
  - if `.env.local` exists, it uses `.env.local`
  - otherwise it falls back to `.env`
- `pnpm dev:neon`
- `pnpm seed:neon`
- `pnpm migrate:neon`

These go through [`scripts/with-env-local.sh`](/Users/yimingsun/Desktop/Arcmath/scripts/with-env-local.sh), which now exports:
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `PASSWORD_PEPPER`
- `OFFICIAL_PDF_STORAGE_DRIVER`
- `OFFICIAL_PDF_CACHE_DIR`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_ENDPOINT`
- `S3_KEY_PREFIX`
- `S3_FORCE_PATH_STYLE`

### Scripts that still use `.env`

- `pnpm dev:local`
- `pnpm build`
- all current `db:*` scripts except `migrate:neon` / `seed:neon`
- importer/backfill/materialization scripts in root `package.json`

This means:
- local Postgres tooling is still `.env`-centric
- Neon-backed local app development is `.env.local`-centric

## Variables You Actually Need

### Minimum for local app development

Required:
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `PASSWORD_PEPPER`
- `OFFICIAL_PDF_STORAGE_DRIVER`

Optional:
- `OFFICIAL_PDF_CACHE_DIR`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`

### Additional variables only if you use S3 storage

Required when `OFFICIAL_PDF_STORAGE_DRIVER="s3"`:
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

Optional:
- `S3_ENDPOINT`
- `S3_KEY_PREFIX`
- `S3_FORCE_PATH_STYLE`

## Recommended Local Setup

### Recommended default

Use Neon-backed local development.

Steps:
1. Copy the template:
   - `cp .env.local.example .env.local`
2. Fill in:
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
   - `PASSWORD_PEPPER`
   - optionally `OPENAI_API_KEY`
3. Start the app:
   - `pnpm dev`

This is the least confusing path because the app, tutor features, and imported real-content flows all use the same up-to-date database.

### Only if you explicitly want local Postgres

Steps:
1. Copy the template:
   - `cp .env.example .env`
2. Fill or confirm local DB values
3. Start local Postgres / Docker if needed
4. Run migrations
5. Use:
   - `pnpm dev:local`

## Production Template

Use [env.production.example](/Users/yimingsun/Desktop/Arcmath/env.production.example) for deployment placeholders.

## Small Recommended Cleanup Going Forward

Current setup is workable, but there is still one conceptual split:
- app development prefers `.env.local`
- many maintenance / import scripts still read `.env`

Small safe recommendation:
1. keep `.env.local` as the default developer path
2. keep `.env` only for explicit local-DB workflows
3. if you later want to simplify further, introduce one shared helper for both env files instead of duplicating inline shell snippets in `package.json`

That would be a future cleanup, not something required to use the repo now.
