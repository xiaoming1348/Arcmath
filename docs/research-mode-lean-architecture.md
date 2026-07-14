# Research Mode Lean Architecture

## Goal

Research Mode should be both an internal tool and an open research guide. It must support proof problems and calculation problems through a verified workflow:

1. Natural language problem -> Lean draft.
2. Lean draft -> Lean final, using prover/search assistance.
3. Lean final -> Lean kernel verification.
4. Lean final -> natural-language and LaTeX explanation.
5. Save verified artifacts as reusable theorem context for later problems.

## Runtime Split

Do not run Lean inside the Next.js web server.

Run the Lean kernel and proof engines as a separate long-running service on the VPS:

- `apps/web`: user interface, auth, org permissions, assignments, Research Mode orchestration.
- `services/proof-verifier`: FastAPI service with SymPy, Lean 4, Mathlib, autoformalization, proof completion, and Lean verification endpoints.
- `services/proof-verifier/lean-workspace`: pinned Lean/mathlib workspace, built into the verifier image.

The web app talks to the verifier through:

```bash
PROOF_VERIFIER_URL=http://proof-verifier:8000
```

The verifier service needs:

```bash
OPENAI_API_KEY=...
ARCMATH_LEAN_TIMEOUT_SEC=180
```

## VPS Deployment Shape

Use `services/proof-verifier/Dockerfile.lean` for production. It builds a warmed Mathlib workspace during image build, so runtime jobs only call `lake env lean` against prebuilt artifacts.

Recommended VPS topology:

```text
Nginx / Caddy
  |
  +-- Next.js web app :3000
  |
  +-- internal proof-verifier :8000
        - Lean 4
        - Mathlib
        - SymPy
        - OpenAI-powered NL -> Lean and proof completion
```

Keep the verifier private to the server network. The public browser should never call it directly; it should call `/api/research-program/lean`, and the web server should proxy to `PROOF_VERIFIER_URL`.

## Theorem Save Strategy

Do not mutate upstream Mathlib from user sessions.

Use this sequence instead:

1. Save verified artifacts per organization/team in the database.
2. Normalize each artifact into a generated Lean module.
3. Periodically build an org-level Lean package such as `ArcmathOrgLibrary`.
4. Import that generated package during later verification jobs.
5. Promote only reviewed, generally useful theorems into a curated internal package.

This gives us reuse without corrupting dependencies or making user-generated theorems globally trusted too early.

## Current MVP

The current web implementation provides:

- `/api/research-program/lean` for health, NL -> Lean draft, draft -> final, verification, one-shot prove, and explanation.
- Research Mode workbench UI for proof/calculation problems.
- Browser-local theorem library for early iteration and demo flow.

Next production step:

- Replace browser-local theorem storage with Prisma models for org/team research artifacts.
- Add job queueing for long Lean jobs.
- Add rate limits and per-org quotas.
- Add generated Lean-package materialization for saved verified theorems.
