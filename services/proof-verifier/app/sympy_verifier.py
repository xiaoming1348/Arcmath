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

_NUMERIC_PROBE_SAMPLES = 12
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


def _verify_equation(latex: str) -> VerifyResponse:
    """Check whether LHS = RHS is an identity (holds for all symbols)."""
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

    numeric_ok, failures = _numeric_probe_equal(lhs, rhs)
    if not numeric_ok:
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


def verify(step_type: StepType, latex: str) -> VerifyResponse:
    """Dispatch to the appropriate SymPy checker by step type."""
    if step_type == StepType.EQUATION or step_type == StepType.ALGEBRAIC_EQUIVALENCE:
        return _verify_equation(latex) if "=" in latex else _verify_equivalence(latex)
    if step_type == StepType.INEQUALITY:
        return _verify_inequality(latex)
    return VerifyResponse(
        verdict=Verdict.UNKNOWN,
        backend=Backend.SYMPY,
        confidence=0.0,
        details={"note": f"SymPy verifier does not handle step type {step_type.value}"},
    )
