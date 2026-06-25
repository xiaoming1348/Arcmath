# CLAUDE.md

> Behavioral guidelines for Claude (Cowork / Claude Code) when working in this
> repo. Adapted from the [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills)
> CLAUDE.md (4 rules distilled from Andrej Karpathy's observations on
> common LLM coding mistakes), with Arcmath-specific tweaks at the end.
>
> **Tradeoff:** these rules bias toward caution over speed. For trivial
> tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

**The test:** every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria
("make it work") require constant clarification.

---

## Arcmath-specific addenda

These supplement the four general rules above; they encode hard-won lessons
from this codebase.

### A. Don't touch the grading engine prompts casually

Files under `apps/web/src/lib/ai/` (proof-tutor, learning-report,
student-progress-report, hint-tutor) contain prompts that have been
tuned against real student data and `grading-eval` runs. Treat them like
load-bearing infrastructure:

- Don't rewrite a prompt for "clarity" without checking against existing
  eval fixtures (`apps/web/src/scripts/grading-eval/`).
- Bump the `*_PROMPT_VERSION` constant when materially changing a prompt
  so we can grep the change in DB rows after deploy.
- The "false-INVALID" class of bugs (correct student work shown as ✗) is
  the most painful failure mode. Be paranoid before tightening a rule.

### B. tsc and unit tests are cheap; run them

- `cd apps/web && ./node_modules/.bin/tsc --noEmit` — should be clean
  before declaring done.
- The student-progress test suite (`student-progress-report.test.ts`)
  runs in seconds and catches aggregation regressions. Always run it
  after touching `student-progress-report.ts`.
- Sandbox can't run the full vitest config (PostCSS native binding
  broken on linux-arm64). Use the `vitest.sandbox.progress.config.ts`
  pattern: `css: { postcss: { plugins: [] } }`.

### C. Prisma client regeneration

The sandbox can't fetch Prisma binary engines (Cloudflare blocks the
CDN). When you add a Prisma model field, the sandbox `tsc` will fail
until you patch `node_modules/.pnpm/@prisma+client.../index.d.ts`
manually (see `outputs/patch_prisma_*.py` for templates). On the user's
Mac, `pnpm prisma generate` resolves it properly.

### D. Bilingual content

The app supports EN + ZH via `apps/web/src/i18n/dictionary.ts`. Two
locales now: UI locale (cookie + `User.locale`) and feedback locale
(`User.feedbackLocale`, defaults to "en" because the competition exams
are English). Don't conflate them — see `resolveLocale` vs
`resolveFeedbackLocaleForUser` in `i18n/server.ts`.

### E. Avoid adding npm dependencies in passing

Each new dep means a `pnpm install` step on the VPS deploy and one
more thing to audit. Prefer hand-rolled SVG over chart libraries,
prefer Web Crypto over crypto libs, prefer fetch over HTTP clients.
If you must add a dep, flag it explicitly so the user can decide.

### F. Don't break production deploy steps

The HK VPS deploy script (`deploy/hk-vps/deploy.sh`) is the
single source of truth for the prod rollout sequence. If your change
requires a new step (e.g. running `prisma generate` on the server),
update `deploy.sh` in the same PR, don't expect the user to remember.

### G. Pilot deployment endpoints (do NOT forget across context compactions)

- **Production URL:** https://arcscience.forecaster-ai.com
- **HK VPS public IP:** `47.76.201.152`
- **SSH user:** `arcmath`
- **SSH key:** `~/.ssh/arcmath-hk.pem` (Aliyun-issued .pem; not loaded by
  default — `id_ed25519` etc. WILL be rejected by the VPS). The user's
  `~/.ssh/config` has an entry pinning this IdentityFile for
  `47.76.201.152`, so `ssh arcmath@47.76.201.152 ...` works without `-i`.
  If a fresh Mac doesn't have that config block, fall back to
  `ssh -i ~/.ssh/arcmath-hk.pem arcmath@47.76.201.152 ...`.
- **VPS repo path:** `/home/arcmath/arcmath`
- **Sudo on VPS:** `arcmath` was created with `--disabled-password`. **There is no password to enter** — any `sudo` that prompts will hang forever. NOPASSWD whitelist (as of 2026-05-28):
  `/usr/bin/systemctl, /usr/sbin/nginx, /usr/bin/certbot, /usr/lib/node_modules/pm2/bin/pm2, /usr/bin/env, /usr/bin/cp, /usr/bin/mv, /usr/bin/tee`
  Anything outside this list (e.g. `sudo cat /etc/sudoers.d/...`, `sudo vim`) will fail. To audit the live list at any time: `sudo -n -l`.
- **Root SSH still works with the same key:** `ssh -i ~/.ssh/arcmath-hk.pem root@47.76.201.152 'whoami'` returns `root`. bootstrap.sh copies `/root/.ssh/authorized_keys` to `/home/arcmath/.ssh/authorized_keys` but doesn't remove from root. Use root for one-off changes that can't go through the NOPASSWD list (sudoers edits, system service installs). **Don't deploy via root** — deploy runs as `arcmath` and the repo is owned by `arcmath`.
- **Editing /etc files** as arcmath: `sudo env cp /tmp/new-file /etc/path/to/file`. The `env` indirection routes through the whitelisted `/usr/bin/env`. `tee`, `cp`, `mv` are now directly whitelisted as of 2026-05-28, so `sudo cp …` also works.
- **GitHub remote:** `git@github.com:xiaoming1348/Arcmath.git`
- **Active feature branch (this worktree):** `ui/tech-aesthetic-step2`
- **Deploy command:**
  ```bash
  ssh arcmath@47.76.201.152 'bash ~/arcmath/deploy/hk-vps/deploy.sh'
  ```
- **Tail logs:**
  ```bash
  ssh arcmath@47.76.201.152 'pm2 logs arcmath-web --lines 50 --nostream'
  ```
- **Geographic latency (so future perf work doesn't chase ghosts):**
  - VPS is in HK. Neon DB is in `us-east-1` — HK → us-east-1 RTT ≈ 200ms.
  - The owner tests from California (UC Berkeley) — Cal → HK RTT ≈ 300ms.
  - Mainland-China end users → HK RTT ≈ 30-80ms.
  - When the owner reports "slow", they're seeing 300ms × 2 (TCP+TLS) + server time, which is roughly 2× what a real user in CN sees. Don't optimize TLS further to chase that — physics caps it at 1 RTT.
  - DB keep-alive (4-min `SELECT 1` from `lib/db-keepalive.ts`) prevents the 800-1000ms reconnect cost; do not delete unless replacing with a Neon serverless adapter.

The user has repeatedly lost time to my forgetting these after
context compaction. This block stays at the bottom of CLAUDE.md
so it's read on every session. If you need to update an endpoint,
edit it here — don't keep it in chat memory only.

### H. Never report deploy/merge "done" without proof

This rule exists because on 2026-05-26 the previous session wrote in a
handoff document that OCR Sprint 1&2 commits were "merged to main and
deployed." In reality the merge had failed mid-conflict (4 unresolved
files, leftover `.git/index.lock`), nothing had been pushed to
`origin/main`, and the VPS was still running pre-OCR code. The next
session spent ~30 minutes recovering before any new work could land.

Required evidence before claiming a deploy is live:

1. `git log origin/main --oneline -5` shows the merge commit (i.e. the
   commit is actually on the remote that the VPS pulls from, not just
   local).
2. `ssh ... 'bash ~/arcmath/deploy/hk-vps/deploy.sh'` finished with the
   `==> ✅ deploy 完成` line AND `[PM2] [arcmath-web](0) ✓` AND
   `(1) ✓` reload markers in the output.
3. `curl -sI https://arcscience.forecaster-ai.com/` returns `HTTP/2 200`.
4. For schema changes: `pm2 logs ... | grep -i migration` or the
   deploy log shows `Applying migration <name>` (or
   `No pending migrations to apply` if already applied).

Required evidence before claiming a merge into `main` is clean:

- `git status` is `working tree clean` (NOT "you have unmerged paths").
- `git log --oneline -5` shows the merge commit at HEAD.
- `git diff origin/main HEAD` is empty after `git push origin main`.

If any of those checks fail or weren't run, the handoff text MUST say
"deploy attempted but verification pending" — not "deployed". Reporting
something as done when it isn't burns ~30 minutes of the next session
on detective work and erodes trust in the handoff doc, which is the
only source-of-truth across context compactions.

### I. Terminal commands must be copy-paste-friendly

When giving the owner commands to run on their Mac or the VPS, **put
each command in its own fenced code block, with no inline comments,
no `# explain this` lines, and no chains the user has to mentally
split apart**. The owner copies the block into Terminal one by one;
they should not have to read and edit each line.

Wrong:

```bash
cd /Users/yimingsun/Desktop/Arcmath && \
git push origin main && \
ssh arcmath@47.76.201.152 'bash ~/arcmath/deploy/hk-vps/deploy.sh' && \
# ^ This deploys
curl -sI https://arcscience.forecaster-ai.com/ | head -1  # verify
```

Right:

```
cd /Users/yimingsun/Desktop/Arcmath
```

```
git push origin main
```

```
ssh arcmath@47.76.201.152 'bash ~/arcmath/deploy/hk-vps/deploy.sh'
```

```
curl -sI https://arcscience.forecaster-ai.com/ | head -1
```

Put any explanation **above or below** the blocks in prose, not inside
the blocks. The owner already lost time stripping `# comments` /
splitting `&&`-chains; this is the rule that prevents it.

If a command genuinely needs flags inline that aren't obvious, prefer
either a short prose sentence right above the block ("Note: pnpm 10
requires `--no-frozen-lockfile` here because…") or invoke the command
once and explain the flag separately rather than inlining a comment
into the command itself.

---

**These guidelines are working if:** fewer unnecessary changes in diffs,
fewer rewrites due to overcomplication, and clarifying questions come
before implementation rather than after mistakes.
