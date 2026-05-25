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

---

**These guidelines are working if:** fewer unnecessary changes in diffs,
fewer rewrites due to overcomplication, and clarifying questions come
before implementation rather than after mistakes.
