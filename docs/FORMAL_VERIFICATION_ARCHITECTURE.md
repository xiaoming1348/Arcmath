# Formal Verification Architecture

Last updated: 2026-07-05

## Core Position

ArcMath should treat 100% accuracy as a property of kernel-verified claims, not as a blanket claim for every natural-language answer. The grading system should show which engine signed each verdict:

- `LEAN_VERIFIED`: Lean kernel accepted the formal statement/proof.
- `SYMPY_VERIFIED`: deterministic algebra/computation check passed.
- `LLM_REVIEW`: model-assisted review only; useful but not a formal guarantee.
- `TEACHER_GRADED`: manual grade for PDF/free-form assignments.
- `NEEDS_REVIEW`: system could not verify with sufficient certainty.

This keeps the product honest while preserving the core technical promise: when Lean or SymPy verifies a step, the answer is not an LLM guess.

## Deployment Recommendation

Do not install and run Lean/mathlib inside the Next.js web process.

Use a separate verifier service:

- Docker image with pinned Lean 4, Lake, and mathlib.
- Locked `lake-manifest.json` / `lean-toolchain`.
- Warm mathlib cache baked into the image or mounted as a persistent volume.
- HTTP API consumed by the web app and future research-mode folder.
- CPU and memory limits per job.
- Short timeouts for interactive grading; longer async jobs for research mode.
- No network access during verification jobs.

The web app should orchestrate requests and persist results; the verifier service should perform deterministic checking.

## Service API Shape

Current `services/proof-verifier` endpoints:

- `GET /health`
- `POST /classify`
  - input: LaTeX step
  - output: step type, confidence, reason
- `POST /verify`
  - input: step type, LaTeX, optional assumptions/context
  - output: SymPy verdict for algebraic steps or Lean-backed claim pipeline result
- `POST /verify/lean`
  - input: Lean file or theorem/proof body
  - output: accepted/rejected/unknown, diagnostics, backend metadata
- `POST /autoformalize`
  - input: natural-language statement
  - output: candidate Lean theorem skeleton
- `POST /complete-lean`
  - input: Lean draft with `sorry`
  - output: completed Lean attempt
- `POST /prove`
  - input: natural-language statement
  - output: autoformalize -> complete -> Lean kernel verification result

Future research-mode endpoints should add async jobs:

- `POST /jobs`
- `GET /jobs/:id`

## Grading Pipeline

1. Normalize student input.
2. Try deterministic engines first:
   - SymPy for algebraic identities, simplification, numeric checks, equations.
   - Lean for proof-level statements and formally encoded reasoning.
3. Use the LLM only to:
   - propose formalization candidates,
   - classify the type of step,
   - explain verified/rejected diagnostics in student-friendly language.
4. Never let the LLM alone issue a `VERIFIED` verdict.
5. Cache verification by normalized statement/proof hash.
6. Store the verification engine and artifact hash beside each attempt step.

## Cloud Infrastructure

Recommended production shape:

- Web app: Next.js, tRPC, Prisma.
- Verifier service: Docker/Fly.io/Cloud Run/ECS container.
- Queue: Redis/BullMQ, Cloud Tasks, or database-backed job table.
- Object storage: formal artifacts, Lean files, logs.
- Database: verification result metadata and cache keys.

The verifier container should include:

- Lean 4 via `elan`.
- mathlib pinned by `lean-toolchain` and `lake-manifest.json`.
- optional `sympy`/Python worker for algebra checks.
- a small API process that writes temp workspaces per job, runs `lake env lean`, captures diagnostics, then deletes the workspace.

Implementation status:

- `services/proof-verifier/Dockerfile` is the slim Python/SymPy image for cheap pilots.
- `services/proof-verifier/Dockerfile.lean` is the Lean/mathlib production image.
- `services/proof-verifier/lean-workspace/lean-toolchain` pins Lean.
- `services/proof-verifier/lean-workspace/lakefile.toml` and `lake-manifest.json` pin mathlib dependencies.
- The Next.js app talks to this service through `PROOF_VERIFIER_URL`.

## Research Mode

The future research-mode folder should use the same verifier service, not a second ad hoc Lean setup.

Research mode can be more permissive:

- longer job timeouts,
- batch formalization,
- richer logs,
- proof search experiments,
- human review queues.

But production student grading should stay conservative:

- fast timeouts,
- strict imports,
- deterministic verdict labels,
- no unverified LLM promotion to `VERIFIED`.

## Product Implication

For PDF/manual assignments, grades remain teacher/manual unless the selected problems are converted into structured `ProblemSet` content with formal artifacts. The new selected-page PDF workflow is a bridge:

1. Teacher selects pages/problems from a book.
2. System extracts and formats the selected source.
3. Teacher can assign it manually now.
4. The same selected source can enter a teacher-review import flow as generated `teacher-v1` JSON.
5. Teacher adds required answers or solution sketches, previews validation, and commits.
6. Approved problems become structured ArcMath problems with SymPy/Lean verification where possible.
