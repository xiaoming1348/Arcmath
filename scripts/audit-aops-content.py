#!/usr/bin/env python3
"""AMC / AIME content QA — scan auto-scraped AoPS manifests for the
common 7 classes of glitch. Pure-JSON, no app dependencies, runnable as:

    python3 scripts/audit-aops-content.py

Writes findings to scripts/audit-aops-content-report.md.

SCOPE — IMPORTANT:
  This scans `packages/db/data/aops-imports/` which is **staging** JSON
  from past bulk-ingest runs, NOT production DB content. As of 2026-05-27
  the staging dir has ~27% empty statements and ~99% MC missing choices,
  but the production DB is clean (curated separately). The script's
  intended use is QA-ing a FRESH bulk-ingest run before importing it —
  not assessing what's currently live. To check live DB, query Neon
  directly (see Phase C content-audit handoff doc).

Checks:
  C1  Unbalanced $ delimiters (LaTeX inline math never closes)
  C2  Suspiciously short statement (< 30 chars — partial scrape)
  C3  Leftover wiki markup ([asy], [image], <math>, <latex>, {{tpl}}, NOTOC)
  C4  MULTIPLE_CHOICE problem missing answer-choice block
  C5  Unicode replacement character (� — encoding issue)
  C6  Empty / missing required field (statement, answer)
  C7  Unbalanced curly braces in math regions (LaTeX \frac{a etc.)

A problem can hit multiple checks; we report the first hit per problem so
the report stays scannable. Severity:
  HIGH  — C4, C6, C5 (problem is broken / unrenderable)
  MED   — C1, C7 (LaTeX glitch — likely renders wrong but partial info)
  LOW   — C2, C3 (likely fine; worth eyeballing)
"""
from __future__ import annotations
import json
import os
import re
from collections import defaultdict

DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "packages", "db", "data", "aops-imports"
)
OUT_REPORT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "audit-aops-content-report.md"
)

# ----------------------------------------------------------------------
# Per-problem checks. Each returns (severity, label, detail) or None.
# ----------------------------------------------------------------------

WIKI_MARKUP_PATTERNS = [
    (re.compile(r"\[asy\]", re.I), "[asy]"),
    (re.compile(r"\[image\]", re.I), "[image]"),
    (re.compile(r"<math>", re.I), "<math>"),
    (re.compile(r"</math>", re.I), "</math>"),
    (re.compile(r"<latex>", re.I), "<latex>"),
    (re.compile(r"\{\{[^}]+\}\}"), "{{template}}"),
    (re.compile(r"__NOTOC__", re.I), "__NOTOC__"),
    (re.compile(r"see also", re.I), "'See also' (trailing scrape)"),
]

# AoPS answer-choice blocks look like `$\text{(A)}\ 1 \qquad \text{(B)}\ ...`
# or `(A) 1 ... (E) 5` etc. We accept either.
HAS_CHOICE_PATTERNS = [
    re.compile(r"\\text\{\(A\)\}|\\textbf\{\(A\)\}|\\\(\s*A\s*\\\)"),
    re.compile(r"\(A\).{0,80}\(B\).{0,80}\(C\)"),
    re.compile(r"\\mathrm\{\(A\)\}|\\mathbf\{\(A\)\}"),
    re.compile(r"\\textbf\{A\}|\\textrm\{A\}\s*[\\s ]*[\.|\)]"),
]


def check_dollars(s: str):
    # Count single $ — but \$ is escaped, doesn't count.
    s2 = re.sub(r"\\\$", "", s)
    n = s2.count("$")
    if n % 2 != 0:
        return ("MED", "C1", f"Unbalanced $ delimiters (count={n})")
    return None


def check_short(s: str):
    # Threshold 25 (was 30): real brief problems like "What is $10! - 7! \cdot 6!$?"
    # are 29 chars and shouldn't flag. False-positive review on prod's 3
    # short rows showed only the year=2099 test stub was actually broken.
    if len(s.strip()) < 25:
        return ("LOW", "C2", f"Statement only {len(s.strip())} chars")
    return None


def check_wiki_markup(s: str):
    for pat, name in WIKI_MARKUP_PATTERNS:
        m = pat.search(s)
        if m:
            return ("LOW", "C3", f"Leftover wiki markup: {name}")
    return None


def check_choices(p: dict):
    if p.get("answerFormat") != "MULTIPLE_CHOICE":
        return None
    s = p.get("statement") or ""
    for pat in HAS_CHOICE_PATTERNS:
        if pat.search(s):
            return None
    # Looser fallback — bare A B C D E with surrounding context. We want
    # this conservative so we don't false-positive on prose using letters.
    if re.search(r"\b\(?A\)?[^\w]{1,4}\(?B\)?[^\w]{1,4}\(?C\)?", s):
        return None
    return ("HIGH", "C4", "MULTIPLE_CHOICE problem missing answer-choice block")


def check_unicode_repl(s: str):
    if "�" in s:
        return ("HIGH", "C5", "Contains Unicode replacement character \\ufffd")
    return None


def check_required(p: dict):
    if not (p.get("statement") or "").strip():
        return ("HIGH", "C6", "Empty statement")
    if not str(p.get("answer", "")).strip():
        return ("HIGH", "C6", "Empty answer")
    return None


def check_brace_balance(s: str):
    # Walk through the string, only count braces inside math regions ($...$).
    # We tolerate mismatches outside math (markdown isn't strict).
    in_math = False
    depth = 0
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "\\" and i + 1 < len(s):
            i += 2
            continue
        if ch == "$":
            if in_math and depth != 0:
                return ("MED", "C7", f"Unbalanced {{}} inside math (depth={depth})")
            in_math = not in_math
            depth = 0
        elif in_math:
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth < 0:
                    return ("MED", "C7", "Stray } inside math")
        i += 1
    if in_math and depth != 0:
        return ("MED", "C7", f"Unbalanced {{}} at end of math (depth={depth})")
    return None


CHECKS = [
    check_required,       # HIGH — short-circuit if missing
    check_unicode_repl,   # HIGH
    check_choices,        # HIGH
    check_dollars,        # MED
    check_brace_balance,  # MED
    check_short,          # LOW
    check_wiki_markup,    # LOW
]


def audit_problem(p: dict):
    """Return first (severity, code, detail) hit, or None."""
    s = p.get("statement") or ""
    for fn in CHECKS:
        if fn is check_choices or fn is check_required:
            hit = fn(p)
        else:
            hit = fn(s)
        if hit:
            return hit
    return None


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------

def main():
    if not os.path.isdir(DATA_DIR):
        raise SystemExit(f"manifest dir not found: {DATA_DIR}")

    files = sorted(f for f in os.listdir(DATA_DIR) if f.endswith(".json"))
    findings = []
    counts = defaultdict(int)
    by_contest = defaultdict(lambda: defaultdict(int))
    total_problems = 0

    for fname in files:
        path = os.path.join(DATA_DIR, fname)
        with open(path) as fp:
            try:
                d = json.load(fp)
            except json.JSONDecodeError as e:
                findings.append({
                    "file": fname, "number": "—",
                    "severity": "HIGH", "code": "C0",
                    "detail": f"manifest JSON parse error: {e}"
                })
                counts["HIGH"] += 1
                continue

        contest = (d.get("problemSet") or {}).get("contest") or fname.split("_")[0]
        for p in d.get("problems") or []:
            total_problems += 1
            hit = audit_problem(p)
            if hit:
                sev, code, detail = hit
                counts[sev] += 1
                by_contest[contest][code] += 1
                findings.append({
                    "file": fname,
                    "number": p.get("number"),
                    "severity": sev,
                    "code": code,
                    "detail": detail,
                    "sourceUrl": p.get("sourceUrl"),
                })

    # Write report
    SEV_ORDER = {"HIGH": 0, "MED": 1, "LOW": 2}
    findings.sort(key=lambda f: (SEV_ORDER.get(f["severity"], 9), f["code"], f["file"], f["number"]))

    with open(OUT_REPORT, "w") as fp:
        fp.write("# AoPS content audit report\n\n")
        fp.write(f"Scanned **{total_problems}** problems across **{len(files)}** manifests in `{os.path.relpath(DATA_DIR, os.path.dirname(OUT_REPORT))}`.\n\n")
        fp.write(f"Findings: **{len(findings)}** flagged ({counts['HIGH']} HIGH, {counts['MED']} MED, {counts['LOW']} LOW). Healthy rate: **{(1 - len(findings)/max(1,total_problems))*100:.2f}%**.\n\n")

        fp.write("## Severity per check code\n\n")
        fp.write("| Contest | HIGH C4 | HIGH C5 | HIGH C6 | MED C1 | MED C7 | LOW C2 | LOW C3 |\n")
        fp.write("|---|---:|---:|---:|---:|---:|---:|---:|\n")
        for c, codes in sorted(by_contest.items()):
            fp.write(f"| {c} "
                     f"| {codes.get('C4',0)} | {codes.get('C5',0)} | {codes.get('C6',0)} "
                     f"| {codes.get('C1',0)} | {codes.get('C7',0)} "
                     f"| {codes.get('C2',0)} | {codes.get('C3',0)} |\n")

        fp.write("\n## Findings (sorted: severity, code, file, problem #)\n\n")
        if not findings:
            fp.write("No issues found.\n")
        else:
            cur_sev = None
            for f in findings:
                if f["severity"] != cur_sev:
                    cur_sev = f["severity"]
                    fp.write(f"\n### {cur_sev}\n\n")
                url = f.get("sourceUrl") or ""
                fp.write(f"- **{f['file']}** problem {f['number']} · `{f['code']}` — {f['detail']}")
                if url:
                    fp.write(f" · [source]({url})")
                fp.write("\n")

    print(f"scanned {total_problems} problems")
    print(f"findings: {len(findings)} ({counts['HIGH']} HIGH, {counts['MED']} MED, {counts['LOW']} LOW)")
    print(f"report: {OUT_REPORT}")


if __name__ == "__main__":
    main()
