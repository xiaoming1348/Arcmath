# Arcmath proof verifier

Python microservice that classifies a student proof step and routes it to the right verification backend.

Backends (MVP):
- **SymPy** — algebraic equivalence, equation identity, simple inequalities
- **Lean** — stubbed (returns UNKNOWN); real backend lands in phase 2
- **LLM judge** — not called from this service; the Next.js app handles LLM fallback on its side

## Run locally

```bash
cd services/proof-verifier
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Point the Next.js app at it via `PROOF_VERIFIER_URL=http://localhost:8000` in `.env.local`.

## Endpoints

- `GET /health` — liveness
- `POST /classify` — `{ latex }` → `{ stepType, confidence }`
- `POST /verify` — `{ stepType, latex, contextLatex? }` → `{ verdict, backend, confidence, details }`

`verdict ∈ { VERIFIED | PLAUSIBLE | UNKNOWN | INVALID | ERROR }`.

## Deploy

Railway/Fly.io/Render all work. See the Dockerfile for a container build.
