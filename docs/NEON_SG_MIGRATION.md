# Neon DB migration to ap-southeast-1 (Singapore) runbook

> Goal: move the production Postgres from `us-east-1` to
> `ap-southeast-1`. Cuts HK VPS ↔ DB RTT from ~200ms to ~30ms — that
> is, every page that does N queries shaves N × 170ms off render time.
>
> Schedule for a low-traffic window. Plan for ~30 min downtime,
> realistic chance of 60 min if anything is surprising.
>
> Best done AFTER Cloudflare is in front (Cloudflare can serve a
> nice maintenance page during the swap if needed).

## Pre-flight checklist

- [ ] You can sign in to console.neon.tech as the project owner.
- [ ] You've taken a logical backup recently (we will take a fresh one
      during this runbook regardless).
- [ ] You can edit `~/arcmath/apps/web/.env.local` on the VPS (via the
      sudo NOPASSWD `cp` we set up).
- [ ] No active pilot demos for the next ~60 min.
- [ ] You have `pg_dump` / `pg_restore` locally OR can run them from a
      cloud shell. Mac install: `brew install libpq` then
      `brew link --force libpq` to get the binaries on PATH.

## Step 1 — create the new Neon project in Singapore (10 min)

1. console.neon.tech → top-left → **New Project**.
2. Region: **ap-southeast-1 (Singapore)**.
3. Postgres version: same major version as current (likely 16; check
   the existing project's settings).
4. Project name: `arcmath-sg` (or similar — not the same as current).
5. Database name: `neondb` (matches current).

Note the new connection strings:

- Pooler (use for app):
  `postgresql://USER:PW@ep-XXXX-pooler.c-1.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1`
- Direct (use for `pg_restore`):
  `postgresql://USER:PW@ep-XXXX.c-1.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

## Step 2 — snapshot the source DB (5 min)

From your Mac:

```bash
# Grab the current DATABASE_URL from VPS (redacted format isn't useful
# here — we need the live one for pg_dump)
SOURCE_URL=$(ssh arcmath@47.76.201.152 'grep "^DATABASE_URL=" ~/arcmath/apps/web/.env.local | cut -d= -f2- | tr -d "\""')

# Replace the pooler hostname with the direct one. pg_dump doesn't
# play well with pgbouncer for parallel jobs. The direct URL is the
# pooler URL with "-pooler" dropped from the hostname:
DIRECT_SOURCE=$(echo "$SOURCE_URL" | sed 's/-pooler\./\./')

# Dump. Custom format (-Fc) so we can use parallel restore later.
mkdir -p ~/Desktop/arcmath-migration
pg_dump "$DIRECT_SOURCE" -Fc -f ~/Desktop/arcmath-migration/source.dump
ls -lh ~/Desktop/arcmath-migration/source.dump
# Expect ~10-30 MB at our pilot scale. If you see <100 KB, the dump
# probably failed silently (check the error).
```

## Step 3 — restore to the new SG DB (10 min)

```bash
# Replace with the DIRECT connection string from step 1.5
TARGET_URL="postgresql://USER:PW@ep-XXXX.c-1.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

# Drop any default schema content on the new DB first (Neon's "neondb"
# starts empty so this is usually a no-op).
psql "$TARGET_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restore. -j 4 = 4 parallel workers; OK for our size.
pg_restore -d "$TARGET_URL" -j 4 --no-owner --no-acl --if-exists --clean ~/Desktop/arcmath-migration/source.dump

# Sanity check
psql "$TARGET_URL" -c "
SELECT
  (SELECT COUNT(*) FROM \"User\") AS users,
  (SELECT COUNT(*) FROM \"ProblemSet\") AS sets,
  (SELECT COUNT(*) FROM \"Problem\") AS problems,
  (SELECT COUNT(*) FROM \"ProblemAttempt\") AS attempts;
"
# Compare those counts to the SAME query against $SOURCE_URL (run
# the same psql against $DIRECT_SOURCE). They should match exactly.
```

## Step 4 — measure the RTT improvement BEFORE swapping prod (5 min)

```bash
# From your VPS (not from Mac — we want HK origin perspective).
# We can reuse the db-rtt script approach from earlier.

ssh arcmath@47.76.201.152 "cat > /home/arcmath/arcmath/apps/web/db-rtt-sg.mjs" << 'EOF'
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
for (let i = 0; i < 5; i++) {
  const t0 = Date.now();
  await p.$queryRaw`SELECT 1`;
  console.log(`query ${i+1}: ${Date.now() - t0}ms`);
}
await p.$disconnect();
EOF

# Point Prisma at the SG pooler URL TEMPORARILY for this test:
ssh arcmath@47.76.201.152 'cd ~/arcmath/apps/web && DATABASE_URL="postgresql://USER:PW@ep-XXXX-pooler.c-1.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1" node db-rtt-sg.mjs && rm db-rtt-sg.mjs'
```

Expected: each query ~30-50ms instead of ~200ms. If you see 200ms+,
the connection string is still pointing to us-east-1 — double-check
the hostname.

## Step 5 — flip prod (the actual cutover, ~5 min)

Decide the swap moment. Tell anyone using the site there's about to
be 1-2 min of write-write-misses (worst case: a user submits an
attempt during the window and it lands on the OLD DB, then we cut to
SG and that attempt is "lost"). Realistically this is rare during
pilot off-hours.

```bash
# 1) Take a final differential snapshot (catches any writes between
#    step 2 and now). Quick because we're under load:
SOURCE_URL=$(ssh arcmath@47.76.201.152 'grep "^DATABASE_URL=" ~/arcmath/apps/web/.env.local | cut -d= -f2- | tr -d "\""')
DIRECT_SOURCE=$(echo "$SOURCE_URL" | sed 's/-pooler\./\./')
pg_dump "$DIRECT_SOURCE" -Fc -f ~/Desktop/arcmath-migration/source-final.dump

# 2) Apply it to the new DB (overwrites the step-3 restore; same shape)
psql "$TARGET_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pg_restore -d "$TARGET_URL" -j 4 --no-owner --no-acl ~/Desktop/arcmath-migration/source-final.dump

# 3) Swap DATABASE_URL on the VPS
NEW_POOLER_URL='postgresql://USER:PW@ep-XXXX-pooler.c-1.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1'

ssh arcmath@47.76.201.152 "
  set -e
  cp ~/arcmath/apps/web/.env.local ~/arcmath/apps/web/.env.local.bak.\$(date +%Y%m%d-%H%M)
  # Use sed to swap just the DATABASE_URL line (sudo env trick if needed
  # — but .env.local is owned by arcmath, no sudo needed).
  sed -i \"s|^DATABASE_URL=.*|DATABASE_URL=\\\"$NEW_POOLER_URL\\\"|\" ~/arcmath/apps/web/.env.local
  grep ^DATABASE_URL ~/arcmath/apps/web/.env.local | sed 's|://[^/]*@|://USER:PW@|'
"

# 4) Reload PM2 so it picks up the new env
ssh arcmath@47.76.201.152 'sudo pm2 reload arcmath-web --update-env'

# 5) Smoke test
curl -sI https://arcscience.forecaster-ai.com/ | head -3
# Login as a known user, hit /me/progress — should feel noticeably faster.
```

## Rollback (if something is wrong post-cutover)

```bash
ssh arcmath@47.76.201.152 'set -e
# Restore previous .env.local
cp ~/arcmath/apps/web/.env.local.bak.<YYYYMMDD-HHMM> ~/arcmath/apps/web/.env.local
sudo pm2 reload arcmath-web --update-env
echo "rolled back to us-east-1"
'
```

The original Neon project in `us-east-1` is still there and intact —
we only ever READ from it during this runbook. Cutting back is one
config swap and a PM2 reload.

## Step 6 — cleanup (after a week of stable SG running)

- [ ] Delete the local dump files (`~/Desktop/arcmath-migration/`).
- [ ] In console.neon.tech, the old project can be left around for a
      month as a "just in case" backup. Eventually delete.
- [ ] Update `CLAUDE.md` addendum G — change "Neon DB is in us-east-1"
      to "Neon DB is in ap-southeast-1; HK ↔ SG ≈ 30ms".

## What this doesn't fix

- OpenAI / Resend calls. Those still go to US, so the grading judge
  / hint tutor / parent-invite email path is still slow (300-500ms
  per LLM round trip). For LLM specifically, the right answer is
  prompt caching + smaller models, not infra.
- User ↔ VPS latency. Cloudflare (see other runbook) fixes that.
- The two combined (CF + SG Neon) are the realistic ceiling for our
  current architecture.
