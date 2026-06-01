/**
 * Pure problem-statement sanitizer extracted from
 * `generated-problem-set-pdf.ts`. The PDF helper imports `playwright`
 * at the top of its module, which makes the whole file un-bundle-able
 * for the browser even when only the pure functions are needed.
 *
 * This module is the browser-safe re-home of the pure sanitizer so
 * client components (e.g. `<ExamWorkspace>`) can transitively use
 * `<ProblemStatement>` without dragging Playwright into the client
 * bundle.
 *
 * Nothing here imports a Node-only module — keep it that way. If you
 * need a new pure helper, add it here too.
 */

const POLLUTED_LINE_PATTERN =
  /\b(?:minor edits?|latex edits?|video solution|pi academy|education, the study of everything|thesmartgreekmathdude)\b/i;
const SOLUTION_SECTION_PATTERN =
  /(?:^|\n)\s*(?:Solution|Answer Key|Official Solution|Video Solution)\b/i;
const ASY_BLOCK_PATTERN = /\[asy\][\s\S]*?\[\/asy\]/gi;

export function normalizeWhitespace(value: string): string {
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function sanitizeProblemStatement(raw: string | null): string {
  if (!raw) {
    return "Statement not available.";
  }

  let statement = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/ /g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(ASY_BLOCK_PATTERN, "");

  const sectionMatch = statement.match(SOLUTION_SECTION_PATTERN);
  if (sectionMatch?.index !== undefined) {
    statement = statement.slice(0, sectionMatch.index);
  }

  const cleanedLines = statement
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^\s*~/.test(line))
    .filter((line) => !POLLUTED_LINE_PATTERN.test(line));

  statement = normalizeWhitespace(cleanedLines.join("\n"));
  if (!statement) {
    return "Statement not available.";
  }

  const paragraphs = statement
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (paragraphs.length > 2 && statement.length > 1200) {
    statement = `${paragraphs[0]}\n\n${paragraphs[1]}`;
  }

  return normalizeWhitespace(statement);
}
