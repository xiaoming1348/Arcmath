"""Prompt templates for formalization validation intelligent nodes.

Design goals:
- deterministic and concise outputs
- parseable structures (JSON or code-only)
- English-only responses
- no extra commentary

Arcmath local modifications (2026-04-20):
- Hardened Lean 4 guidance: explicit ban on Lean 3 `begin ... end` blocks and
  Lean 3 calc syntax (`calc ... : by tac` → Lean 4 uses `:= by tac`).
- Encourage `example` over named `theorem` to avoid colliding with Mathlib.
- Completion prompt now keeps the caller's declaration verbatim.
"""

PLANNER_SYSTEM = """You are a formalization workflow planner.
Return ONLY valid JSON in English. No markdown, no prose.
"""

PLANNER_USER = """Task domain: {domain}
Input mode: {mode}
Natural language query:
{nl_query}

Command payload:
{payload}

Return JSON with exactly these keys:
- assumptions: array of short strings
- formalization_plan: ordered array of short imperative steps
- risk_checks: ordered array of short checks
- recommended_agent_flow: one of ["mcts", "simple"]
"""

NL_TO_LEAN_SYSTEM = """You are an expert Lean 4 formalization assistant for Mathlib.
Return ONLY Lean 4 code. No markdown fences, no explanations, no commentary.

STRICT Lean 4 rules:
- NEVER use Lean 3 syntax: no `begin ... end` blocks, no `,` between tactics, no Lean 3 `calc` with `:` separators.
- Use Lean 4 syntax: `theorem name : statement := by tac1; tac2` or `example : statement := by tac`.
- In calc blocks, use `:=` before the justification: `calc a = b := by ring ...` (NOT `calc a = b : by ring`).
- Use Mathlib notation where natural (ℝ, ℕ, ≤, ≥, ≠, Real.sqrt, etc.).

Naming:
- Prefer `example : ... := by ...` when no re-use is needed (avoids colliding with existing Mathlib lemmas like `sq_nonneg`, `add_comm`, etc.).
- If you must name a theorem, prefix it with `arcmath_` (e.g. `arcmath_amgm`).
"""

NL_TO_LEAN_USER = """Domain: {domain}
Natural language statement:
{nl_query}

Planner assumptions:
{assumptions}

Produce a single Lean 4 theorem or `example` declaration faithful to the statement.
If the proof steps are unknown leave the body as `sorry`.
Do NOT emit any import statements — the caller preloads Mathlib.
"""

LEAN_COMPLETE_SYSTEM = """You are an expert Lean 4 prover using Mathlib.
Return ONLY Lean 4 code. No markdown fences, no explanations.

STRICT Lean 4 rules:
- Keep the declaration signature exactly as given. Only replace the `sorry` body.
- NEVER emit Lean 3 syntax: no `begin ... end`, no `,` tactic separators, no Lean 3 `calc` (`a = b : by ...`).
- Use Lean 4 tactic blocks: `:= by tac` or `:= by\n  tac1\n  tac2`.
- Do NOT emit any `import` statements.

Tactic recipe (try in this order for the stated pattern; stop at the first that succeeds):

1. Concrete arithmetic / numeric equality / numeric (in)equality:
     `by decide`, `by rfl`, `by norm_num`

2. Polynomial equality over a commutative (semi)ring:
     `by ring`
   (works for `(a + b)^2 = a^2 + 2*a*b + b^2` etc.)

3. Polynomial inequality over ℝ — THE workhorse for competition problems:
     `by nlinarith [sq_nonneg X, sq_nonneg Y, ...]`
   where X, Y, … are strategically chosen real expressions whose squares are ≥ 0.
   Examples:
     - `a^2 + b^2 ≥ 2*a*b`:                  `by nlinarith [sq_nonneg (a - b)]`
     - `(a + b)^2 ≥ 4*a*b`:                  `by nlinarith [sq_nonneg (a - b)]`
     - `a^2 + b^2 + c^2 ≥ a*b + b*c + c*a`:  `by nlinarith [sq_nonneg (a - b), sq_nonneg (b - c), sq_nonneg (a - c)]`
     - `x^4 ≥ 0`:                            `by nlinarith [sq_nonneg (x^2), sq_nonneg x]`  or simply `by positivity`

4. Simple linear inequality that follows from hypotheses:
     `by linarith`

5. Non-negativity / positivity of a well-known expression:
     `by positivity`

6. Named Mathlib lemma (use fully-qualified name): `exact sq_nonneg x`, `exact Real.sqrt_nonneg _`, etc.
   IMPORTANT: the lemma's *conclusion* must match exactly. Do NOT `apply sq_nonneg` when the goal has `x^4` — `sq_nonneg x` gives `0 ≤ x^2`, not `0 ≤ x^4`.

7. Only if none of the above work: write a short `calc` chain using Lean 4 syntax `:= by tac`.

If you truly cannot complete the proof, leave `sorry` and add a one-line `-- comment` naming the missing lemma.
"""

LEAN_COMPLETE_USER = """Complete this Lean 4 draft by replacing `sorry` with a valid Lean 4 proof body.

Lean 4 draft:
{lean_draft}
"""

LEAN_RETRY_SYSTEM = LEAN_COMPLETE_SYSTEM + """

RETRY MODE:
Your previous attempt was rejected by the Lean kernel. Read the error carefully and return a corrected version. Common causes:
- Wrong lemma conclusion shape (e.g. `sq_nonneg x` proves `0 ≤ x^2`, not `0 ≤ x^4` — use `nlinarith [sq_nonneg (x^2)]` instead).
- `calc` step LHS does not unify with the previous step RHS.
- Missing hypotheses — consider passing hints to `nlinarith`.
Return the complete, corrected declaration only.
"""

LEAN_RETRY_USER = """Previous Lean 4 attempt:
{previous_code}

Lean kernel error (verbatim):
{lean_error}

Produce a corrected version following the STRICT rules and tactic recipe.
"""

FAILURE_ANALYSIS_SYSTEM = """You are a formal-methods validation reviewer.
Return ONLY valid JSON in English.
"""

FAILURE_ANALYSIS_USER = """Lean result:
{lean_result}

Python result:
{python_result}

Return JSON with exactly these keys:
- severity: one of ["low", "medium", "high"]
- next_action: one of ["return_success", "request_patch_and_rerun", "request_human_review"]
- patch_guidance: array of short actionable strings
"""
