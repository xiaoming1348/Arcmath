"""SymPy-backed verification for algebraic equalities, equations, and simple inequalities.

Parser: `sympy.parsing.latex.parse_latex` (antlr4-based). It understands a
useful subset of LaTeX but not everything. Parse failures return ERROR with
details so the caller can route to LLM fallback rather than show a misleading
verdict.
"""

from __future__ import annotations

import random
import re
from typing import Any

import sympy as sp
from sympy.parsing.latex import parse_latex  # type: ignore[attr-defined]

from .schemas import Backend, StepType, Verdict, VerifyResponse

# Bumped 12 → 60 after observing a false-VERIFIED slip past 24 samples
# on a deliberately-wrong off-by-one student attempt. Larger sample
# count compresses the probability of a "lucky" probe-pass on a
# subtly-broken inequality. Cost: each probe is one .evalf() call,
# ~100µs, so 60 vs 12 samples = ~6 ms extra latency per step.
_NUMERIC_PROBE_SAMPLES = 60
_NUMERIC_TOLERANCE = 1e-9


def _clean_latex(latex: str) -> str:
    """Strip whitespace and normalize a few surface-level LaTeX idioms that
    trip the parser but don't change meaning."""
    s = latex.strip()
    s = s.replace("\\left", "").replace("\\right", "")
    s = s.replace("\\cdot", "*").replace("\\times", "*")
    # \dfrac / \tfrac → \frac (sympy parser only knows \frac)
    s = re.sub(r"\\dfrac|\\tfrac", r"\\frac", s)
    return s


def _try_parse(latex: str) -> tuple[sp.Expr | None, str | None]:
    try:
        expr = parse_latex(_clean_latex(latex))
        return expr, None
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__}: {e}"


def _split_on_top_level_operator(latex: str, operators: tuple[str, ...]) -> tuple[str, str, str] | None:
    """Split `A op B` at the FIRST top-level occurrence of an operator in `operators`.

    "Top-level" means outside of {..} braces and (..) parens. Keeps us from
    splitting on the = inside \\frac{}{} or similar.
    """
    depth_curly = 0
    depth_paren = 0
    i = 0
    while i < len(latex):
        ch = latex[i]
        if ch == "{":
            depth_curly += 1
        elif ch == "}":
            depth_curly -= 1
        elif ch == "(":
            depth_paren += 1
        elif ch == ")":
            depth_paren -= 1
        elif depth_curly == 0 and depth_paren == 0:
            for op in operators:
                if latex.startswith(op, i):
                    # Skip the `=` inside `==`, `!=`, `<=`, `>=` when we're looking for plain `=`.
                    if op == "=" and i + 1 < len(latex) and latex[i + 1] == "=":
                        i += 2
                        continue
                    if op == "=" and i > 0 and latex[i - 1] in "<>!:":
                        i += 1
                        continue
                    return latex[:i], op, latex[i + len(op):]
        i += 1
    return None


def _free_symbols(*exprs: sp.Expr) -> list[sp.Symbol]:
    seen: dict[str, sp.Symbol] = {}
    for expr in exprs:
        for sym in expr.free_symbols:
            if isinstance(sym, sp.Symbol):
                seen.setdefault(sym.name, sym)
    return list(seen.values())


def _numeric_probe_equal(lhs: sp.Expr, rhs: sp.Expr, samples: int = _NUMERIC_PROBE_SAMPLES) -> tuple[bool, list[dict[str, Any]]]:
    """Probe many random real values. Returns (all_close, failing_samples)."""
    syms = _free_symbols(lhs, rhs)
    rng = random.Random(0xA7C0FFEE)
    failures: list[dict[str, Any]] = []
    for _ in range(samples):
        subs = {s: sp.Float(rng.uniform(-4.0, 4.0)) for s in syms}
        try:
            left = complex(lhs.evalf(subs=subs))
            right = complex(rhs.evalf(subs=subs))
        except Exception:  # noqa: BLE001
            continue
        if not (abs(left - right) <= _NUMERIC_TOLERANCE * (1.0 + abs(left) + abs(right))):
            failures.append({
                "subs": {str(k): float(v) for k, v in subs.items()},
                "lhs": str(left),
                "rhs": str(right),
            })
            if len(failures) >= 3:
                break
    return (len(failures) == 0, failures)


def _verify_equivalence(latex: str) -> VerifyResponse:
    """Treat the whole latex as a single expression that should simplify to 0.

    Useful when the student writes a standalone expression they think is
    equal to some previous one. Without a reference, we can't say more than
    "parses cleanly, non-zero" — that's UNKNOWN, not INVALID.
    """
    expr, err = _try_parse(latex)
    if expr is None:
        return VerifyResponse(
            verdict=Verdict.ERROR,
            backend=Backend.SYMPY,
            confidence=0.0,
            details={"stage": "parse", "error": err},
        )
    simplified = sp.simplify(expr)
    return VerifyResponse(
        verdict=Verdict.UNKNOWN,
        backend=Backend.SYMPY,
        confidence=0.2,
        details={
            "stage": "standalone_expression",
            "simplified": str(simplified),
            "note": "Needs a reference expression to judge equivalence.",
        },
    )


def _parse_assumption_equation(latex: str) -> tuple[sp.Expr, sp.Expr] | None:
    """Parse an `LHS = RHS` LaTeX string into a (lhs, rhs) SymPy pair.
    Returns None if parsing fails — assumption is then ignored, not fatal.
    """
    split = _split_on_top_level_operator(latex, ("=",))
    if split is None:
        return None
    lhs_s, _, rhs_s = split
    lhs, _ = _try_parse(lhs_s)
    rhs, _ = _try_parse(rhs_s)
    if lhs is None or rhs is None:
        return None
    return (lhs, rhs)


def _is_tautology(lhs: sp.Expr, rhs: sp.Expr) -> bool:
    """An assumption `lhs = rhs` is a tautology when lhs - rhs simplifies
    to 0. Tautologies are always-true so they impose NO constraint —
    feeding them to sp.solve produces a trivial empty solution that
    must not be treated as a "counterexample" against the target.
    """
    try:
        return sp.simplify(lhs - rhs) == 0
    except Exception:  # noqa: BLE001
        return False


def _try_solve_for_target(
    target: sp.Expr,
    assumption_pairs: list[tuple[sp.Expr, sp.Expr]],
) -> tuple[bool, str]:
    """Return (entails_zero, evidence). If every solution of the
    assumptions makes `target == 0`, returns (True, ""). If at least
    one solution makes it non-zero AND the solutions are non-trivial,
    returns (False, counterexample). Returns (False, "") when
    undecidable so the caller can fall back to the numeric probe.
    """
    if not assumption_pairs:
        return (False, "")
    # Drop tautologies — they impose no constraint.
    constraints = [
        (lhs, rhs) for (lhs, rhs) in assumption_pairs if not _is_tautology(lhs, rhs)
    ]
    if not constraints:
        return (False, "")
    syms = _free_symbols(target, *(e for pair in constraints for e in pair))
    if not syms:
        return (False, "")
    eqs = [sp.Eq(lhs, rhs) for (lhs, rhs) in constraints]
    try:
        sols = sp.solve(eqs, syms, dict=True)
    except Exception:  # noqa: BLE001
        return (False, "")
    if not sols:
        return (False, "")
    # Filter trivial empty-dict solutions — they mean "any value works",
    # i.e. the constraints did not actually constrain anything.
    real_sols = [sol for sol in sols if len(sol) > 0]
    if not real_sols:
        return (False, "")
    counter: dict[str, sp.Expr] | None = None
    for sol in real_sols:
        try:
            evaluated = sp.simplify(target.subs(sol))
        except Exception:  # noqa: BLE001
            return (False, "")
        if evaluated != 0:
            counter = {str(k): str(v) for k, v in sol.items()}
            break
    if counter is not None:
        return (False, f"counterexample under assumptions: {counter}")
    return (True, f"target vanishes on all {len(real_sols)} solution(s) of the assumptions")


def _looks_like_substitution_declaration(latex: str) -> bool:
    """True when the input is a list of variable assignments
    (`n=1, a=1, b=2, c=2`) rather than a single algebraic identity.

    Heuristic: count top-level `=` signs that are separated by `,`.
    Two or more separated by commas → treat as substitution declaration.

    Why this matters: SymPy's `parse_latex("1, a=1, b=2, c=2.")` will
    silently truncate at the first comma and return `1`, so a step like
    "n=1, a=1, b=2, c=2" gets misverified as "n = 1" and rejected as
    INVALID under the numeric probe. We need to skip the equation check
    entirely for these inputs and let an LLM judge handle them.
    """
    # Strip a single trailing period, common when students write "n=1."
    s = latex.strip().rstrip(".")
    parts = [p.strip() for p in s.split(",")]
    # At least two parts AND every part contains an `=` outside of braces
    if len(parts) < 2:
        return False
    eq_count = 0
    for part in parts:
        split = _split_on_top_level_operator(part, ("=",))
        if split is not None:
            eq_count += 1
    return eq_count >= 2


def _verify_equation(latex: str, assumptions: list[str] | None = None) -> VerifyResponse:
    """Check whether LHS = RHS is an identity (holds for all symbols)."""
    # Bail out early on substitution-style declarations like
    # "n=1, a=1, b=2, c=2". These aren't algebraic identities and the
    # parser truncates them. We return PLAUSIBLE so the merge layer
    # routes to ABSTAIN → escalation → LLM judge, which is the right
    # backend for "is this a valid candidate solution".
    if _looks_like_substitution_declaration(latex):
        return VerifyResponse(
            verdict=Verdict.PLAUSIBLE,
            backend=Backend.SYMPY,
            confidence=0.0,
            details={
                "stage": "substitution_declaration_skip",
                "note": "Input looks like a multi-variable substitution declaration; SymPy cannot judge identity here.",
            },
        )

    split = _split_on_top_level_operator(latex, ("=",))
    if split is None:
        return VerifyResponse(
            verdict=Verdict.ERROR,
            backend=Backend.SYMPY,
            confidence=0.0,
            details={"stage": "split", "error": "no top-level = operator"},
        )
    lhs_s, _, rhs_s = split
    lhs, err_l = _try_parse(lhs_s)
    rhs, err_r = _try_parse(rhs_s)
    if lhs is None or rhs is None:
        return VerifyResponse(
            verdict=Verdict.ERROR,
            backend=Backend.SYMPY,
            confidence=0.0,
            details={"stage": "parse", "lhs_error": err_l, "rhs_error": err_r},
        )
    diff = sp.simplify(lhs - rhs)
    if diff == 0:
        return VerifyResponse(
            verdict=Verdict.VERIFIED,
            backend=Backend.SYMPY,
            confidence=0.98,
            details={"stage": "symbolic", "lhs": str(lhs), "rhs": str(rhs), "diff": "0"},
        )

    # === Use assumptions when the surface check failed. ===
    parsed_assumptions: list[tuple[sp.Expr, sp.Expr]] = []
    for a in (assumptions or []):
        pair = _parse_assumption_equation(a)
        if pair is not None:
            parsed_assumptions.append(pair)
    if parsed_assumptions:
        entails, evidence = _try_solve_for_target(diff, parsed_assumptions)
        if entails:
            return VerifyResponse(
                verdict=Verdict.VERIFIED,
                backend=Backend.SYMPY,
                confidence=0.95,
                details={
                    "stage": "symbolic_with_assumptions",
                    "lhs": str(lhs),
                    "rhs": str(rhs),
                    "assumptions": [f"{l} = {r}" for (l, r) in parsed_assumptions],
                    "note": evidence,
                },
            )
        if evidence:
            return VerifyResponse(
                verdict=Verdict.INVALID,
                backend=Backend.SYMPY,
                confidence=0.9,
                details={
                    "stage": "symbolic_with_assumptions_counterexample",
                    "lhs": str(lhs),
                    "rhs": str(rhs),
                    "assumptions": [f"{l} = {r}" for (l, r) in parsed_assumptions],
                    "note": evidence,
                },
            )

    numeric_ok, failures = _numeric_probe_equal(lhs, rhs)
    if not numeric_ok:
        # Conservative carve-out: we downgrade to PLAUSIBLE (→ ABSTAIN
        # at the merge layer) when the step has 2+ free variables.
        # Real-world step equations almost always carry an unstated
        # domain constraint (positivity, integer-ness, etc.). Without
        # an assumption-aware sampler we cannot confidently call
        # INVALID on a uniform-real counterexample. 1-variable
        # equations stay strict.
        n_free = len(_free_symbols(lhs, rhs))
        has_assumptions = bool(assumptions or [])
        if n_free >= 2:
            return VerifyResponse(
                verdict=Verdict.PLAUSIBLE,
                backend=Backend.SYMPY,
                confidence=0.4,
                details={
                    "stage": "numeric_probe_unconstrained_multivar"
                    if not has_assumptions
                    else "numeric_probe_assumption_unaware",
                    "lhs": str(lhs),
                    "rhs": str(rhs),
                    "free_var_count": n_free,
                    "has_assumptions": has_assumptions,
                    "counterexamples_in_random_reals": failures[:3],
                    "note": (
                        "counterexamples found via uniform-real sampling; "
                        "either the step has 3+ free vars without "
                        "constraints, or hypotheses were provided that "
                        "our sampler cannot respect. Escalating."
                    ),
                },
            )
        return VerifyResponse(
            verdict=Verdict.INVALID,
            backend=Backend.SYMPY,
            confidence=0.9,
            details={
                "stage": "numeric_probe",
                "lhs": str(lhs),
                "rhs": str(rhs),
                "counterexamples": failures,
            },
        )

    # Numerically equal but didn't simplify → equation probably holds
    # conditionally, or simplify isn't strong enough. Don't claim VERIFIED.
    return VerifyResponse(
        verdict=Verdict.PLAUSIBLE,
        backend=Backend.SYMPY,
        confidence=0.6,
        details={
            "stage": "numeric_probe",
            "lhs": str(lhs),
            "rhs": str(rhs),
            "diff_simplified": str(diff),
            "note": "numerically equal across probes; symbolic simplify inconclusive.",
        },
    )


_INEQ_OPERATORS = ("\\leq", "\\geq", "\\le", "\\ge", "\\neq", "\\ne", "<=", ">=", "≤", "≥", "≠", "<", ">")


def _verify_inequality(latex: str) -> VerifyResponse:
    """MVP: numerically probe the inequality. A probe-pass means PLAUSIBLE
    with moderate confidence; we do NOT claim VERIFIED (Lean territory)."""
    split = _split_on_top_level_operator(latex, _INEQ_OPERATORS)
    if split is None:
        return VerifyResponse(
            verdict=Verdict.ERROR,
            backend=Backend.SYMPY,
            confidence=0.0,
            details={"stage": "split", "error": "no top-level inequality operator"},
        )
    lhs_s, op, rhs_s = split
    lhs, err_l = _try_parse(lhs_s)
    rhs, err_r = _try_parse(rhs_s)
    if lhs is None or rhs is None:
        return VerifyResponse(
            verdict=Verdict.ERROR,
            backend=Backend.SYMPY,
            confidence=0.0,
            details={"stage": "parse", "operator": op, "lhs_error": err_l, "rhs_error": err_r},
        )

    # Build a concrete inequality we can numerically probe.
    compare = {
        "\\leq": (lambda a, b: a <= b + _NUMERIC_TOLERANCE),
        "\\le":  (lambda a, b: a <= b + _NUMERIC_TOLERANCE),
        "≤":     (lambda a, b: a <= b + _NUMERIC_TOLERANCE),
        "<=":    (lambda a, b: a <= b + _NUMERIC_TOLERANCE),
        "\\geq": (lambda a, b: a >= b - _NUMERIC_TOLERANCE),
        "\\ge":  (lambda a, b: a >= b - _NUMERIC_TOLERANCE),
        "≥":     (lambda a, b: a >= b - _NUMERIC_TOLERANCE),
        ">=":    (lambda a, b: a >= b - _NUMERIC_TOLERANCE),
        "<":     (lambda a, b: a < b),
        ">":     (lambda a, b: a > b),
        "\\neq": (lambda a, b: abs(a - b) > _NUMERIC_TOLERANCE),
        "\\ne":  (lambda a, b: abs(a - b) > _NUMERIC_TOLERANCE),
        "≠":     (lambda a, b: abs(a - b) > _NUMERIC_TOLERANCE),
    }.get(op)
    if compare is None:
        return VerifyResponse(
            verdict=Verdict.UNKNOWN,
            backend=Backend.SYMPY,
            confidence=0.0,
            details={"stage": "operator_map", "operator": op},
        )

    syms = _free_symbols(lhs, rhs)
    rng = random.Random(0xB0BA57)
    counterexamples: list[dict[str, Any]] = []
    probes = 0
    for _ in range(_NUMERIC_PROBE_SAMPLES * 2):
        subs = {s: sp.Float(rng.uniform(-4.0, 4.0)) for s in syms}
        try:
            a = float(lhs.evalf(subs=subs))
            b = float(rhs.evalf(subs=subs))
        except Exception:  # noqa: BLE001
            continue
        probes += 1
        if not compare(a, b):
            counterexamples.append({
                "subs": {str(k): float(v) for k, v in subs.items()},
                "lhs": a,
                "rhs": b,
            })
            if len(counterexamples) >= 3:
                break

    if counterexamples:
        # Conservative carve-out: counterexamples found by uniform-real
        # sampling are unreliable when the step has 2+ free variables.
        # Real-world step inequalities almost always carry an unstated
        # domain constraint (positivity, ordering like b≤a, integer-
        # ness, or bounded range). Without an assumption-aware sampler
        # — which we don't have yet — any random counterexample might
        # simply be a point violating those constraints. We downgrade
        # to PLAUSIBLE so the merge layer escalates rather than
        # committing a false INVALID.
        #
        # 1-variable inequalities are kept strict: a counterexample in
        # one variable usually IS dispositive (e.g. n^{1/n} < 2 - 1/n
        # for some specific n).
        n_free = len(_free_symbols(lhs, rhs))
        if n_free >= 2:
            return VerifyResponse(
                verdict=Verdict.PLAUSIBLE,
                backend=Backend.SYMPY,
                confidence=0.4,
                details={
                    "stage": "numeric_probe_unconstrained_multivar",
                    "operator": op,
                    "free_var_count": n_free,
                    "counterexamples_in_random_reals": counterexamples,
                    "note": (
                        "counterexamples found in unconstrained reals; "
                        "step may still hold under problem-stated "
                        "domain constraints. Escalating."
                    ),
                },
            )
        return VerifyResponse(
            verdict=Verdict.INVALID,
            backend=Backend.SYMPY,
            confidence=0.85,
            details={
                "stage": "numeric_probe",
                "operator": op,
                "counterexamples": counterexamples,
            },
        )

    if probes == 0:
        return VerifyResponse(
            verdict=Verdict.UNKNOWN,
            backend=Backend.SYMPY,
            confidence=0.0,
            details={"stage": "numeric_probe", "operator": op, "note": "no probes evaluated"},
        )

    return VerifyResponse(
        verdict=Verdict.PLAUSIBLE,
        backend=Backend.SYMPY,
        confidence=0.55,
        details={
            "stage": "numeric_probe",
            "operator": op,
            "probes": probes,
            "note": "probes pass; not a proof. Use Lean for rigorous verification.",
        },
    )


def verify(
    step_type: StepType,
    latex: str,
    assumptions: list[str] | None = None,
) -> VerifyResponse:
    """Dispatch to the appropriate SymPy checker by step type.

    `assumptions` is a list of LaTeX strings (typically prior proof
    steps). The equation path uses them to verify steps that only
    follow from the given hypotheses (e.g. substituting x+y=5 and
    xy=6 to verify x^2+y^2=13).
    """
    if step_type == StepType.EQUATION or step_type == StepType.ALGEBRAIC_EQUIVALENCE:
        return _verify_equation(latex, assumptions) if "=" in latex else _verify_equivalence(latex)
    if step_type == StepType.INEQUALITY:
        return _verify_inequality(latex)
    return VerifyResponse(
        verdict=Verdict.UNKNOWN,
        backend=Backend.SYMPY,
        confidence=0.0,
        details={"note": f"SymPy verifier does not handle step type {step_type.value}"},
    )
