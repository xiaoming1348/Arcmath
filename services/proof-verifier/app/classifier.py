"""Rule-based step classifier.

We intentionally keep this narrow and conservative: when the rules are
uncertain, return UNKNOWN so the caller can fall back to LLM classification.
"""

from __future__ import annotations

import re

from .schemas import ClassifyResponse, StepType

# Deduction / narrative keywords (Chinese + English). Matched case-insensitively.
_DEDUCTION_CUES = (
    r"\\therefore|\\Rightarrow|\\Leftrightarrow|\\implies|\\iff|"
    r"\btherefore\b|\bhence\b|\bthus\b|\bso that\b|\bwhich means\b|"
    r"因此|所以|故|从而|即|即得|于是"
)

_CASE_CUES = (
    r"\\text\{\s*case\s*\d*\s*\}|\bcase\s+\d+\b|\bcases?:|"
    r"情形|分情况|情况[一二三四五六]"
)

_CLAIM_CUES = (
    r"\\text\{\s*claim\s*\}|\bclaim:|\bwe claim\b|\blemma\b|"
    r"\b(断言|引理|命题)"
)

_CONCLUSION_CUES = (
    r"\\boxed\{|\bfinal answer\b|\banswer\s*[:=]|\bQ\.?E\.?D\.?|\\blacksquare|"
    r"综上|\b所求\b|答[:：]"
)

_INEQ = r"\\leq|\\geq|\\le\b|\\ge\b|<=|>=|\\neq|\\ne\b|≤|≥|≠|<|>"
_EQ = r"(?<![<>!:=])=(?!=)"


def _strip(latex: str) -> str:
    return latex.strip()


def _has(pattern: str, text: str) -> bool:
    return re.search(pattern, text, flags=re.IGNORECASE) is not None


def classify(latex: str) -> ClassifyResponse:
    """Best-effort step classifier using lightweight surface heuristics.

    The philosophy: be correct-and-narrow, not clever. The caller has a real
    LLM it can fall back to when we return UNKNOWN with low confidence.
    """
    text = _strip(latex)
    if not text:
        return ClassifyResponse(step_type=StepType.UNKNOWN, confidence=0.0, reason="empty input")

    # Structural cues take precedence over operator-level cues.
    if _has(_CASE_CUES, text):
        return ClassifyResponse(step_type=StepType.CASE_SPLIT, confidence=0.7, reason="case-split cue")

    if _has(_CLAIM_CUES, text):
        return ClassifyResponse(step_type=StepType.CLAIM, confidence=0.65, reason="claim cue")

    if _has(_CONCLUSION_CUES, text):
        return ClassifyResponse(step_type=StepType.CONCLUSION, confidence=0.75, reason="conclusion cue")

    has_ineq = _has(_INEQ, text)
    has_eq = _has(_EQ, text)
    has_ded = _has(_DEDUCTION_CUES, text)

    if has_ineq:
        return ClassifyResponse(step_type=StepType.INEQUALITY, confidence=0.75, reason="inequality operator present")

    if has_eq:
        # "LHS = RHS" alone → equation / algebraic step.
        return ClassifyResponse(step_type=StepType.EQUATION, confidence=0.75, reason="equality operator present")

    if has_ded:
        return ClassifyResponse(step_type=StepType.DEDUCTION, confidence=0.6, reason="deduction connector")

    # A standalone expression with no operator: treat as an algebraic rewrite target.
    if re.search(r"[0-9a-zA-Z]", text):
        return ClassifyResponse(
            step_type=StepType.ALGEBRAIC_EQUIVALENCE,
            confidence=0.4,
            reason="expression without operator",
        )

    return ClassifyResponse(step_type=StepType.UNKNOWN, confidence=0.0, reason="no recognised cues")
