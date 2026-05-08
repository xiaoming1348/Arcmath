"""In-chat CLI runner for the proof verification pipeline.

Runs the SymPy + rule-classifier layer directly (no HTTP, no DB, no LLM).
Designed for quick iterative tests in the Claude Code chat: pass a problem
and a list of student steps, see per-step verdicts.

Usage:
    python3.11 try.py --problem "..." --step "<latex>" --step "<latex>" ...

Each --step adds one step to the attempt, in order.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from app.classifier import classify as rule_classify
from app.sympy_verifier import verify as sympy_verify
from app.schemas import Backend, StepType, Verdict, VerifyResponse


# ANSI colour helpers — keeps the output readable in a terminal.
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
BLUE = "\033[34m"
MAGENTA = "\033[35m"
CYAN = "\033[36m"

VERDICT_COLOUR = {
    Verdict.VERIFIED: GREEN,
    Verdict.PLAUSIBLE: YELLOW,
    Verdict.UNKNOWN: DIM,
    Verdict.INVALID: RED,
    Verdict.ERROR: RED,
}

VERDICT_ICON = {
    Verdict.VERIFIED: "✓",
    Verdict.PLAUSIBLE: "⚠",
    Verdict.UNKNOWN: "?",
    Verdict.INVALID: "✗",
    Verdict.ERROR: "!",
}


def run_step(index: int, latex: str) -> dict[str, Any]:
    cls = rule_classify(latex)
    print(f"{BOLD}{CYAN}Step {index + 1}{RESET}  {DIM}{latex}{RESET}")
    print(f"  classify → {BLUE}{cls.step_type.value}{RESET}  "
          f"{DIM}(conf {cls.confidence:.2f}, reason: {cls.reason}){RESET}")

    verify: VerifyResponse = sympy_verify(cls.step_type, latex)
    colour = VERDICT_COLOUR.get(verify.verdict, RESET)
    icon = VERDICT_ICON.get(verify.verdict, "·")
    print(f"  verify   → {colour}{icon} {verify.verdict.value}{RESET}  "
          f"{DIM}backend={verify.backend.value}  confidence={verify.confidence:.2f}{RESET}")

    if verify.details:
        details = json.dumps(verify.details, ensure_ascii=False, indent=2)
        # Keep details compact for chat output.
        for line in details.splitlines():
            print(f"    {DIM}{line}{RESET}")
    print()

    return {
        "step_index": index,
        "latex": latex,
        "step_type": cls.step_type.value,
        "verdict": verify.verdict.value,
        "backend": verify.backend.value,
        "confidence": verify.confidence,
        "details": verify.details,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the proof verifier on a list of steps.")
    parser.add_argument("--problem", required=True, help="Problem statement (LaTeX ok).")
    parser.add_argument(
        "--step",
        action="append",
        required=True,
        help="A single proof step in LaTeX. Pass --step multiple times for a full proof.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON summary after the human-readable trace.",
    )
    args = parser.parse_args()

    print(f"{BOLD}{MAGENTA}Problem:{RESET} {args.problem}\n")

    results = [run_step(i, step) for i, step in enumerate(args.step)]

    # End-of-attempt summary.
    verdict_counts: dict[str, int] = {}
    for r in results:
        verdict_counts[r["verdict"]] = verdict_counts.get(r["verdict"], 0) + 1
    summary = "  ".join(
        f"{VERDICT_COLOUR.get(Verdict(k), RESET)}{VERDICT_ICON.get(Verdict(k), '·')} {k}: {v}{RESET}"
        for k, v in verdict_counts.items()
    )
    print(f"{BOLD}Summary:{RESET} {summary}")

    if args.json:
        print()
        print(json.dumps({"steps": results, "verdicts": verdict_counts}, ensure_ascii=False, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
