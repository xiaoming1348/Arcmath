"""Lean backend: real subprocess-driven verification via vendored kernel.

Invokes `lake env lean` inside `services/proof-verifier/lean-workspace/` using
`lean_kernel.formal_executor.run_lean_check` (vendored from partner's repo).

Translation to our verdict taxonomy:
- CheckResult.status SUCCESS → VERIFIED (Lean kernel accepted the proof)
- CheckResult.status FAIL    → INVALID (Lean kernel rejected — typecheck/proof error)
- CheckResult.status WARN    → UNKNOWN (toolchain missing, or timeout, or non-decisive)

For step-level proof problems the caller is expected to have already wrapped
the student's step into a well-formed Lean theorem (likely via the
autoformalize endpoint). Bare LaTeX will not validate.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional

from .lean_kernel import formal_executor
from .schemas import Backend, StepType, Verdict, VerifyResponse

_LEAN_WORKSPACE_DIR = Path(__file__).resolve().parents[1] / "lean-workspace"
_LEAN_TIMEOUT_SEC = int(os.environ.get("ARCMATH_LEAN_TIMEOUT_SEC", "120"))

_CARRIER_IMPORT = "import ArcmathVerifier"


def _ensure_carrier_import(lean_code: str) -> str:
    """Ensure the student snippet imports our pre-built carrier lib so the
    Lean process only has to load one local olean instead of re-resolving
    the entire Mathlib dependency tree."""
    lines = lean_code.splitlines()
    # Keep any existing `import` lines at the top; just make sure our carrier is first.
    for line in lines[:10]:
        if line.strip().startswith("import ArcmathVerifier"):
            return lean_code
    return f"{_CARRIER_IMPORT}\n{lean_code}"


# Guard patterns against Lean 3 syntax that GPT sometimes emits even after
# explicit instructions. If matched, we tag the response as needing a retry.
_LEAN3_BEGIN_RE = re.compile(r"(^|\n)\s*begin\b")
_LEAN3_CALC_COLON_RE = re.compile(r"calc[^\n]*[^:=]:\s*by\s", re.IGNORECASE)


def detect_lean3_syntax(lean_code: str) -> Optional[str]:
    """Heuristic check for Lean 3 leaks. Returns a short reason string if
    detected, else None."""
    if _LEAN3_BEGIN_RE.search(lean_code):
        return "contains Lean 3 `begin` block (use `by` tactic syntax instead)"
    if _LEAN3_CALC_COLON_RE.search(lean_code):
        return "contains Lean 3 calc `:` separator (Lean 4 uses `:=`)"
    return None


def wrap_in_namespace(lean_code: str, namespace: str = "ArcmathAttempt") -> str:
    """Wrap student/LLM-produced code in a namespace to isolate theorem
    names from Mathlib and from other concurrent verifier runs."""
    # If already in a namespace, don't double-wrap.
    if re.search(r"^\s*namespace\s+\w", lean_code, re.MULTILINE):
        return lean_code
    return f"namespace {namespace}\n\n{lean_code.strip()}\n\nend {namespace}\n"


# Require an actual provable declaration. Without this guard, an empty file
# (or comment-only output from a confused LLM) would compile cleanly and be
# misreported as VERIFIED — a false positive on the answer key.
_STRIPPED_COMMENTS_RE = re.compile(r"/-.*?-/", re.DOTALL)
_LINE_COMMENT_RE = re.compile(r"--[^\n]*")
_DECL_RE = re.compile(r"^\s*(theorem|lemma|example|def)\b", re.MULTILINE)


def strip_comments(lean_code: str) -> str:
    code = _STRIPPED_COMMENTS_RE.sub("", lean_code)
    code = _LINE_COMMENT_RE.sub("", code)
    return code


def contains_declaration(lean_code: str) -> bool:
    return bool(_DECL_RE.search(strip_comments(lean_code)))


def contains_sorry(lean_code: str) -> bool:
    # Match `sorry` as a standalone identifier (not inside a larger word).
    return bool(re.search(r"(^|[^\w])sorry([^\w]|$)", strip_comments(lean_code)))


def _ensure_workspace() -> Optional[Path]:
    if not _LEAN_WORKSPACE_DIR.exists():
        return None
    if not (_LEAN_WORKSPACE_DIR / "lakefile.toml").exists() and not (_LEAN_WORKSPACE_DIR / "lakefile.lean").exists():
        return None
    return _LEAN_WORKSPACE_DIR


def verify_lean_code(lean_code: str) -> VerifyResponse:
    """Run raw Lean source through lake+lean and map to a VerifyResponse."""
    workspace = _ensure_workspace()
    if workspace is None:
        return VerifyResponse(
            verdict=Verdict.UNKNOWN,
            backend=Backend.LEAN,
            confidence=0.0,
            details={
                "stage": "workspace_missing",
                "note": f"Expected lake project at {_LEAN_WORKSPACE_DIR}",
            },
        )

    # Fail fast on Lean 3 syntax leaks so the caller can surface a clear
    # "please retry" signal instead of waiting 45s only to get a cryptic
    # Lean kernel "unknown identifier `begin`" error.
    lean3_reason = detect_lean3_syntax(lean_code)
    if lean3_reason:
        return VerifyResponse(
            verdict=Verdict.ERROR,
            backend=Backend.LEAN,
            confidence=0.99,
            details={
                "stage": "lean3_syntax_rejected",
                "reason": lean3_reason,
                "note": "Source contains Lean 3 syntax; ask the LLM to retry with strict Lean 4.",
            },
        )

    # Guard against the "empty payload compiles clean" false positive: require
    # at least one declaration that Lean can actually check. A file containing
    # only `-- statement is false` (or nothing at all) compiles with exit 0
    # but has verified nothing — we must not map that to VERIFIED.
    if not contains_declaration(lean_code):
        return VerifyResponse(
            verdict=Verdict.UNKNOWN,
            backend=Backend.LEAN,
            confidence=0.0,
            details={
                "stage": "no_declaration",
                "reason": "Input Lean source contains no theorem/example/lemma/def to verify.",
            },
        )

    # `sorry` compiles (as a warning) so the kernel would return success, but
    # the proof is incomplete — do not claim VERIFIED.
    if contains_sorry(lean_code):
        return VerifyResponse(
            verdict=Verdict.UNKNOWN,
            backend=Backend.LEAN,
            confidence=0.0,
            details={
                "stage": "contains_sorry",
                "reason": "Input still contains `sorry`; proof is incomplete.",
            },
        )

    wrapped = wrap_in_namespace(lean_code)
    prepared = _ensure_carrier_import(wrapped)
    result = formal_executor.run_lean_check(
        lean_code=prepared,
        workdir=workspace,
        auto_install_lean=False,
    )

    # Partner's run_lean_check uses "PASS" / "FAIL" / "WARN"; normalize.
    if result.status in ("PASS", "SUCCESS"):
        return VerifyResponse(
            verdict=Verdict.VERIFIED,
            backend=Backend.LEAN,
            confidence=0.99,
            details={
                "machine_checked": result.machine_checked,
                "runtime_note": result.runtime_note,
                "command": result.command,
            },
        )
    if result.status == "FAIL":
        # Truncate to keep payload small.
        stdout_tail = (result.stdout or "")[-1500:]
        stderr_tail = (result.stderr or "")[-1500:]
        return VerifyResponse(
            verdict=Verdict.INVALID,
            backend=Backend.LEAN,
            confidence=0.92,
            details={
                "reason": result.reason,
                "returncode": result.returncode,
                "stdout_tail": stdout_tail,
                "stderr_tail": stderr_tail,
                "runtime_note": result.runtime_note,
            },
        )

    # WARN or anything else: can't tell.
    return VerifyResponse(
        verdict=Verdict.UNKNOWN,
        backend=Backend.LEAN,
        confidence=0.0,
        details={
            "reason": result.reason,
            "runtime_note": result.runtime_note,
            "stage": result.status.lower(),
        },
    )


def verify(step_type: StepType, latex: str) -> VerifyResponse:
    """Back-compat shim: the old stub signature. We no longer attempt to
    autoformalize LaTeX here — that's the `/autoformalize` endpoint. Callers
    that want real Lean checking should pass already-formalized Lean source
    via `verify_lean_code`."""
    return VerifyResponse(
        verdict=Verdict.UNKNOWN,
        backend=Backend.LEAN,
        confidence=0.0,
        details={
            "stage": "not_autoformalized",
            "note": (
                "Lean backend requires a Lean 4 source string. "
                "Autoformalize the student's LaTeX first via POST /autoformalize."
            ),
            "step_type": step_type.value,
        },
    )
