# Arcmath proof verifier

Python microservice that classifies student proof steps and routes them to deterministic verification backends.

Backends:

- **SymPy** for algebraic equivalence, equation identities, and simple inequalities.
- **Lean 4 + mathlib** for raw Lean source through `/verify/lean` and claim-level `/prove` workflows.
- **LLM fallback is not a verifier**. The Next.js app can use LLM review when formal tools return `UNKNOWN`, but only SymPy/Lean verdicts should be labeled machine verified.

## Run Locally

```bash
cd services/proof-verifier
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Point the Next.js app at it:

```bash
PROOF_VERIFIER_URL=http://localhost:8000
```

For `/prove` and `/autoformalize`, set `OPENAI_API_KEY` in the verifier process. Raw `/verify/lean` does not need OpenAI, but it does need the Lean workspace dependencies built.

## Endpoints

- `GET /health`
- `POST /classify` - `{ latex }` -> `{ step_type, confidence, reason }`
- `POST /verify` - routes SymPy checks directly and CLAIM checks through `/prove`
- `POST /verify/lean` - `{ lean_code }` -> Lean kernel verdict
- `POST /autoformalize` - natural-language statement -> Lean draft
- `POST /complete-lean` - Lean draft with `sorry` -> completed proof attempt
- `POST /prove` - natural-language statement -> autoformalize -> complete -> Lean verify

`verdict` is one of `VERIFIED`, `PLAUSIBLE`, `UNKNOWN`, `INVALID`, or `ERROR`.

## Docker Images

The default image is slim and cheap:

```bash
docker build -f Dockerfile -t arcmath-proof-verifier:sympy .
```

It includes Python/SymPy and is suitable for pilots where proof-heavy Lean verification can escalate to teacher review.

The production formal-verification image includes Lean 4 and a pinned mathlib workspace:

```bash
docker build -f Dockerfile.lean -t arcmath-proof-verifier:lean .
```

Use this image for the cloud verifier service behind `PROOF_VERIFIER_URL`. Keep it separate from the Next.js web container so Lean/mathlib build time, memory, and execution limits do not affect the web app.

## Lean Workspace

The Lean project lives in `lean-workspace/`.

- `lean-toolchain` pins Lean: `leanprover/lean4:v4.30.0-rc2`.
- `lakefile.toml` pins mathlib to the same commit recorded in `lake-manifest.json`.
- `Dockerfile.lean` runs `lake exe cache get` and `lake build` during image build so runtime jobs can call `lake env lean` against a warm workspace.

Operational settings:

- `ARCMATH_LEAN_TIMEOUT_SEC` controls Lean job timeout, default `120`.
- Run the verifier with CPU and memory limits in production.
- Do not enable network access for per-request Lean jobs.
- Persist only normalized artifacts/logs needed for audits; temporary job workspaces should be deleted.
