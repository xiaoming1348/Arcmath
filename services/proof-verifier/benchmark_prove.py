"""Benchmark for /prove (NL → autoformalize → complete → kernel).

Runs a fixed menu of real math statements ranging from trivial (Lean core)
through standard inequalities (Mathlib-backed) and deliberately false
statements (sanity checks). Hits the running verifier at :8765.

Prints a summary table so we can see pass/fail patterns and timings.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request


BENCH = [
    # label, natural_language, expected_status
    ("core-add",   "Prove that 2 + 3 = 5.",                                                                 "VERIFIED"),
    ("core-neq",   "Prove that 2 + 2 is not equal to 5.",                                                   "VERIFIED"),
    ("core-gt",    "Prove that 5 is greater than 3.",                                                       "VERIFIED"),
    ("sq-nonneg",  "Prove that for any real number x, x^2 is non-negative.",                                "VERIFIED"),
    ("sos-2",      "Prove that for all real numbers a and b, a^2 + b^2 >= 2 * a * b.",                      "VERIFIED"),
    ("amgm-sq",    "Prove that for all real numbers a and b, (a + b)^2 >= 4 * a * b.",                      "VERIFIED"),
    ("sos-3",      "Prove that for all real numbers a, b, c, a^2 + b^2 + c^2 >= a*b + b*c + c*a.",          "VERIFIED"),
    ("x4-nonneg",  "Prove that for every real number x, x^4 is non-negative.",                              "VERIFIED"),
    ("false-1",    "Prove that 1 + 1 = 3.",                                                                 "INVALID"),
    ("false-2",    "Prove that for all real numbers x, x^2 is negative.",                                   "INVALID"),
]


def post(path: str, body: dict, timeout: int = 300) -> dict:
    req = urllib.request.Request(
        f"http://127.0.0.1:8765{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def colour(status: str) -> str:
    c = {"VERIFIED": "\x1b[32m", "INVALID": "\x1b[31m", "UNKNOWN": "\x1b[33m", "LLM_FAIL": "\x1b[35m", "NO_API_KEY": "\x1b[35m"}
    return f"{c.get(status, '')}{status}\x1b[0m"


def run(save_json: str | None) -> None:
    results = []
    passes = 0
    for label, nl, expected in BENCH:
        t0 = time.time()
        try:
            r = post("/prove", {"domain": "math", "natural_language_statement": nl, "max_completion_retries": 2})
        except Exception as exc:  # noqa: BLE001
            r = {"status": "ERROR", "notes": str(exc), "autoformalized": "", "completed": ""}
        dt = time.time() - t0

        got = r.get("status", "?")
        ok = (got == expected)
        if ok:
            passes += 1

        print(f"{'✓' if ok else '✗'} [{label:12s}] expected {expected:8s} got {colour(got):<22s} ({dt:5.1f}s)")
        # One-line snippet of the Lean code actually verified.
        completed = (r.get("completed") or "").strip().splitlines()
        if completed:
            snippet = completed[0][:90]
            print(f"   lean: {snippet}")
        if not ok:
            details = r.get("verifier_details", {})
            if details.get("reason"):
                print(f"   fail reason: {str(details['reason'])[:200]}")
            if details.get("stdout_tail"):
                print(f"   stdout: {str(details['stdout_tail'])[:200]}")
            if r.get("notes"):
                print(f"   notes: {r['notes'][:200]}")

        results.append({
            "label": label, "nl": nl, "expected": expected, "got": got, "elapsed_sec": round(dt, 1),
            "autoformalized": r.get("autoformalized", ""),
            "completed": r.get("completed", ""),
            "verifier_details": r.get("verifier_details", {}),
            "notes": r.get("notes", ""),
        })
        print()

    print(f"=== Summary: {passes}/{len(BENCH)} passed ===")

    if save_json:
        with open(save_json, "w") as f:
            json.dump({"summary": {"passed": passes, "total": len(BENCH)}, "results": results}, f, indent=2, ensure_ascii=False)
        print(f"(detailed JSON: {save_json})")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--save-json", default=None)
    args = p.parse_args()
    run(args.save_json)
