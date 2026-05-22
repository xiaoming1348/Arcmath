# Grading Engine v2 — Design

> Status: in-progress (2026-05-10). This file freezes the architecture so the
> codebase, tests and ops docs all converge on the same vocabulary.

## 1. Why v2

Today we have two unconnected grading paths:

1. **`answer-grading.ts`** on `main` — final-answer auto-grading for
   `MULTIPLE_CHOICE / INTEGER / EXPRESSION`. Solid but very narrow (string
   normalization only — no LaTeX equivalence beyond surface rewrites).
2. **`unified-attempt.ts`** on this worktree — step-by-step pipeline that
   stitches the Python proof-verifier (SymPy + Lean stub) and several OpenAI
   calls (`classifyStepWithLlm`, `judgeStepWithLlm`, `generateProofReview`).
   Untested end-to-end. Multiple known defects (e.g. `verify(StepType.CLAIM)`
   hardcoded `UNKNOWN`).

The product asks for **three** things v1 cannot do:

- **B1 — Past-paper hint tutor + personalized report.** Mostly already on
  `main`; v2 only needs to wire the report generator to a richer per-attempt
  log (which step the student crashed on, which milestone went missing).
- **B2 — Teacher-assigned proofs that the engine grades.** Students enter
  ordered key derivation steps. Engine **must** be near-100% accurate on
  steps it commits to, and **must** escalate the unsure ones to the teacher.
  This is where v2 lives or dies.
- **B3 — Teacher copilot.** For any uploaded problem the engine produces a
  short, *guaranteed-correct* milestone outline.

The bar is "国际高中数学竞赛 100% 批改准确率". A single false-VERIFIED is a
trust-killer; we'd rather escalate to the teacher than be wrong. That target
drives every architectural choice below.

## 2. Three-tier verdict model

Every step output carries:

```
{ verdict, confidence, source, evidence, escalate }
```

- `verdict ∈ { VERIFIED | INVALID | UNCERTAIN }`
- `confidence ∈ [0, 1]` — calibrated, not raw model probabilities
- `source` — which backend(s) produced it (`SYMPY`, `LEAN`, `LLM_JUDGE`,
  `RULE`, `RUBRIC_MATCH`, `EQUIV_PROVER`, `TEACHER`, …)
- `evidence` — the smallest snippet a teacher can audit (counterexample
  substitutions, Lean kernel error tail, milestone index hit, etc.)
- `escalate ∈ { NONE | TEACHER_REVIEW }` — flips on whenever the engine is
  not confident enough to commit to a verdict (see §4).

Important constraint: **`VERIFIED` and `INVALID` only fire when at least one
deterministic backend (SymPy / Lean / rule) supports the call**, or two
independent LLM judges agree at high confidence. Pure LLM-only verdicts are
downgraded to `UNCERTAIN` by default.

Mapping back to existing DB enums: `UNCERTAIN` covers what was previously
spread across `PLAUSIBLE / UNKNOWN / ERROR / PENDING`. We collapse them in the
API layer so the teacher UI has one queue.

## 3. Step pipeline (v2)

```
                      ┌── classify ──┐
student_step ────────►│  (rule LLM)  ├──► step_type
                      └──────────────┘
                              │
                              ▼
                  ┌─────────────────────────┐
                  │   verification fan-out   │
                  │ ┌─────────┐ ┌──────────┐ │
                  │ │ SymPy   │ │ Lean     │ │
                  │ │ (algebra│ │ (kernel  │ │
                  │ │ /eq/ineq│ │  via fly │ │
                  │ │  probe) │ │  service)│ │
                  │ └─────────┘ └──────────┘ │
                  │ ┌─────────┐ ┌──────────┐ │
                  │ │ rubric  │ │ LLM      │ │
                  │ │ match   │ │ judge×N  │ │
                  │ └─────────┘ └──────────┘ │
                  └─────────────┬───────────┘
                                ▼
                       ┌────────────────┐
                       │ confidence merge│  (§5)
                       └────────┬────────┘
                                ▼
                       ┌────────────────┐
                       │ escalation gate │  (§4)
                       └────────┬────────┘
                                ▼
                       step_verdict + evidence
```

The fan-out is a **set**, not a chain. Each backend independently classifies
the step into `{VERIFIED, INVALID, ABSTAIN}` and emits its own confidence
and evidence. The merge layer is what produces the user-facing verdict.

This is decoupled from the existing `runStepVerification` — which is a chain
that gives up at the first signal — so v2 can be added without breaking the
shipping path.

## 4. Escalation policy

A step gets `escalate = TEACHER_REVIEW` when **any** of the following:

1. No deterministic backend produced a verdict, and we have ≤ 1 LLM judge
   vote, OR LLM judges disagree.
2. SymPy parsed-fail (`ERROR`) and the step *type* is one SymPy should
   handle (`EQUATION`, `ALGEBRAIC_EQUIVALENCE`, `INEQUALITY`).
3. Lean attempted but came back `WARN` / toolchain unavailable, on a step
   the rubric flags as critical (final conclusion or named-lemma claim).
4. Confidence (post-merge) below the per-step-type threshold:
   - `EQUATION / ALGEBRAIC_EQUIVALENCE`: 0.95
   - `INEQUALITY`: 0.92
   - `CLAIM / DEDUCTION`: 0.90
   - `CASE_SPLIT / CONCLUSION`: 0.95
5. The student's step contradicts a verified milestone (`INVALID` with
   ≥0.95 conf is *not* escalated; lower-confidence INVALID is).

Why these numbers: empirical thresholds picked so the dataset we expect to
build (§7) yields false-VERIFIED ≤ 0.5% and false-INVALID ≤ 1%. They are
parameters in `escalation.ts` and tuned by replaying the gold set.

## 5. Confidence merging

Two independent backends agreeing at high confidence → near-1.
One backend high-conf + one backend ABSTAIN → single-source confidence.
Two backends disagreeing → take the deterministic one if any exists, else
`UNCERTAIN`.

Implementation in `confidence.ts` is a small, fully unit-testable pure
function — no LLM calls, no I/O. We treat individual backend confidences as
probabilities of correctness, weight them by a deterministic-vs-LLM prior,
and combine with a noisy-OR (for agreement) / max-min (for disagreement).
See `confidence.test.ts` for the table of expected outputs.

## 6. Rubric / milestone schema

Every problem has a `Rubric`: an ordered list of `Milestone` items.

```ts
type Milestone = {
  id: string;             // stable, used as foreign key
  index: number;          // 1..N, presentation order
  title: string;          // short label
  claim: string;          // the assertion the student must establish
  techniques: string[];   // tags for credit-equivalent alternatives
  dependsOn: string[];    // other milestone ids
  critical: boolean;      // gates final-conclusion correctness
  // Optional: machine-checkable form. When present, we can grade by
  // checking the student's step entails the claim, instead of LLM-mapping.
  formal?: {
    kind: "lean4-statement";
    code: string;
  };
};
```

Three sources for a rubric:

- **Authored** — teacher fills it in via the upload form (B3).
- **Auto-generated** — `solution-generator.ts` (existing) for past-papers
  where only a sketch exists.
- **Hybrid** — auto-generated, then teacher edits / approves before it goes
  live (lock behind `approvedAt`).

Grading produces a `MilestoneCoverage[]` where each entry is exactly the v2
step verdict but bound to a milestone instead of a free-form step. The
final-answer correctness for the problem is computed deterministically from
the coverage of `critical=true` milestones.

## 7. Evaluation infrastructure

We cannot make any "100% accuracy" claim without a measurable baseline.

### 7.1 Gold set

Composition target (≥ 200 problems):

| Source | Count | Why |
|---|---|---|
| `miniF2F-lean4` test split | 80 | High-school olympiad standard; already Lean-formalized |
| `OlympiadBench` IMO+CMO+USAMO subset | 60 | Step-level expert annotations |
| `PutnamBench` selection | 30 | Higher-difficulty stress |
| Internal teacher-authored | 30 | Match real assignment style |

Each entry is `{ statement, official_solution, rubric, student_solutions[] }`
where `student_solutions[]` covers the full taxonomy: clean correct, alt
correct, off-by-one, wrong final answer with valid scaffolding, false-but-
plausible, totally wrong.

### 7.2 Metrics

- `step_verdict_accuracy` (per backend and merged)
- `step_escalation_rate` (target: ≤ 25% for healthy v2 launch)
- `false_verified_rate` (target: ≤ 0.5%)
- `false_invalid_rate` (target: ≤ 1%)
- `final_answer_accuracy` (this is the one we report externally)
- `teacher_agreement_rate` on escalated steps (sampled)

### 7.3 Harness

`scripts/grading-eval.ts` — replays the gold set against the v2 pipeline
and prints both per-backend and merged metrics. Runs in CI (without
network) using cassettes for the LLM/Lean calls; runs nightly with live
backends for the on-deploy report.

## 8. Failure modes we will not allow

1. **False-VERIFIED on a wrong step.** Mitigation: deterministic-only
   `VERIFIED`, plus rubric coverage gate.
2. **Teacher swamped by escalation.** Mitigation: confidence thresholds in
   §4 are tunable; if escalation rate exceeds 30% we lower the bar (LLM-
   only `INVALID` is allowed when two judges agree at ≥0.92).
3. **Stale rubric used to grade.** Mitigation: rubric has a `version` field;
   regrade is automatic when version bumps.

## 9. Roadmap

This document covers the first three slices.

- **Slice A (this commit):** core types, confidence merge, escalation gate,
  rubric schema, step pipeline skeleton with backend interfaces, full
  unit-test coverage, CLAIM-bug fix in the Python verifier.
- **Slice B:** wire real backends behind the v2 interfaces (SymPy, Lean
  via Fly verifier, OpenAI judges), hook into `unified-attempt` behind a
  feature flag.
- **Slice C:** import `miniF2F-lean4` + `OlympiadBench` into a gold set,
  add `scripts/grading-eval.ts`, publish first baseline number.
- **Slice D:** introduce DeepSeek-Prover-V2 / Goedel-Prover-V2 as a third
  Lean-completion backend. Add LeanCopilot for tactic suggestion.
- **Slice E:** AlphaGeometry-style geometry pipeline (separate router by
  topic — geometry doesn't go through Lean today and shouldn't).
- **Slice F:** teacher review queue UI and feedback loop (escalated steps
  flow into a learn-from-teacher table that retrains thresholds).
