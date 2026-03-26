#!/usr/bin/env python3

import argparse
import json
import re
from pathlib import Path

from pypdf import PdfReader


QUESTION_END_PATTERNS = [
    r" Find [^.?!]*[.?!]",
    r" What [^.?!]*[?]",
    r" Compute [^.?!]*[.?!]",
    r" Determine [^.?!]*[.?!]",
]


def normalize_whitespace(raw: str) -> str:
    text = raw.replace("\u00a0", " ")
    text = re.sub(r"Page \d+ of \d+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def strip_exam_headers(text: str, year: int, exam: str) -> str:
    candidates = [
        f"AIME {exam} {year}",
        f"AIME {year} {exam} • Problems",
        f"AIME {year} {exam} · Problems",
    ]
    cleaned = text
    for candidate in candidates:
        cleaned = cleaned.replace(candidate, " ")
    return cleaned


def split_problem_chunks(text: str) -> dict[int, str]:
    parts = re.split(r"\bProblem\s+(\d+)\b", text)
    chunks: dict[int, str] = {}
    for index in range(1, len(parts), 2):
        number = int(parts[index])
        chunk = normalize_whitespace(parts[index + 1])
        if chunk:
            chunks[number] = chunk
    return chunks


def extract_statement(chunk: str) -> str:
    pattern = re.compile("|".join(QUESTION_END_PATTERNS))
    match = pattern.search(f" {chunk}")
    if match:
        return chunk[: match.end()].strip()
    raise ValueError(f"Could not find a question-ending sentence in chunk: {chunk[:160]}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fill empty AIME AoPS JSON statements from a local routecheck problems PDF."
    )
    parser.add_argument("--aops-json", required=True, help="Path to the AoPS JSON with answers/source URLs.")
    parser.add_argument("--problems-pdf", required=True, help="Path to the routecheck problems PDF.")
    parser.add_argument("--out", required=True, help="Output path for the filled JSON.")
    parser.add_argument("--year", required=True, type=int, help="Contest year.")
    parser.add_argument("--exam", required=True, choices=["I", "II"], help="AIME exam label.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    aops_path = Path(args.aops_json)
    pdf_path = Path(args.problems_pdf)
    out_path = Path(args.out)

    payload = json.loads(aops_path.read_text())
    reader = PdfReader(str(pdf_path))
    combined = "\n".join((page.extract_text() or "") for page in reader.pages)
    combined = strip_exam_headers(combined, args.year, args.exam)
    chunks = split_problem_chunks(combined)

    missing_numbers = []
    for problem in payload["problems"]:
        number = problem["number"]
        chunk = chunks.get(number)
        if not chunk:
            missing_numbers.append(number)
            continue
        problem["statement"] = extract_statement(chunk)

    if missing_numbers:
        raise ValueError(f"Missing routecheck chunks for problems: {missing_numbers}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    print(out_path)


if __name__ == "__main__":
    main()
