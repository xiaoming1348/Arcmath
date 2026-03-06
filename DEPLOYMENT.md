# Vercel + Neon First Launch Guide

This guide is for deploying this monorepo to Vercel (app: `apps/web`) with Neon PostgreSQL.

## 1. Monorepo Readiness Check

Status: suitable for Vercel deployment of `apps/web`.

- Workspace is configured via `pnpm-workspace.yaml` (`apps/*`, `packages/*`).
- `apps/web` depends on workspace packages `@arcmath/db` and `@arcmath/shared`.
- Next config already transpiles workspace packages:
  - `apps/web/next.config.ts` -> `transpilePackages: ["@arcmath/db", "@arcmath/shared"]`
- Prisma schema is in `packages/db/prisma/schema.prisma` and uses `DATABASE_URL`.

Important caveat:
- Root scripts in `package.json` source `./.env`, which is local-dev oriented.
- On Vercel, do not rely on root `pnpm build` / `pnpm db:*` wrappers.
- Use direct sub-package commands (provided below).

## 2. Recommended Vercel Project Settings

- Framework Preset: `Next.js`
- Root Directory: `apps/web`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm -C ../../packages/db prisma generate && pnpm build`

Notes:
- The build command is executed under `apps/web`, so `../../packages/db` points to workspace `packages/db`.
- Start command is managed by Vercel for Next.js.

## 3. CI vs Release Responsibilities

## CI (safe to run on every PR/main build)

```bash
pnpm install --frozen-lockfile
pnpm -C packages/db prisma generate
pnpm -C apps/web build
pnpm test
```

## Release stage (must target production DB)

Run before/with production rollout (GitHub Action/manual job):

```bash
pnpm -C packages/db prisma migrate deploy
pnpm preflight:production
```

Rationale:
- `migrate deploy` must run against the actual production Neon database, not preview DB.
- `preflight:production` validates required env vars and DB schema expectations.

## 4. Required/Optional Env Vars (Production)

Use `.env.production.example` as baseline.

Required:
- `DATABASE_URL` (Neon connection string with `?sslmode=require`)
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `PASSWORD_PEPPER`
- `OFFICIAL_PDF_STORAGE_DRIVER` (`s3` recommended in production)

Conditionally required (if `OFFICIAL_PDF_STORAGE_DRIVER=s3`):
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

Optional:
- `S3_ENDPOINT`
- `S3_KEY_PREFIX`
- `S3_FORCE_PATH_STYLE`

## 5. Usage Check: Critical Vars

- `DATABASE_URL`
  - `packages/db/prisma/schema.prisma`
  - `scripts/preflight-production.ts`
- `NEXTAUTH_URL`
  - `apps/web/src/lib/trpc/client.ts`
  - `scripts/preflight-production.ts`
- `NEXTAUTH_SECRET`
  - `apps/web/src/lib/auth.ts`
  - `apps/web/src/middleware.ts`
  - `scripts/preflight-production.ts`
- `PASSWORD_PEPPER`
  - `apps/web/src/lib/password.ts`
  - `packages/db/prisma/seed.ts`
  - `scripts/preflight-production.ts`

## 6. Storage Driver Recommendation for Production

Set:

```bash
OFFICIAL_PDF_STORAGE_DRIVER=s3
```

Reason:
- Local disk (`local`) is ephemeral on serverless platforms and not suitable for durable production cache.
- S3-compatible object storage is durable and expected by current production runbook.

## 7. First Launch Checklist

1. Create Neon production database and copy connection string into Vercel `DATABASE_URL`.
2. Configure all required env vars in Vercel (Production environment scope).
3. Trigger release migration step:
   - `pnpm -C packages/db prisma migrate deploy`
4. Trigger Vercel production deployment.
5. Verify auth/login and `/resources` PDF flow.
