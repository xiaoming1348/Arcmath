import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import {
  type ImportProblemSetInput
} from "../packages/shared/src/import-schema";
import { applyRealImportQuality, getRealImportQualityFileSetKey } from "./real-import-quality";

const execFile = promisify(execFileCallback);

type BuildOptions = {
  aopsJsonPath: string;
  problemsPdfPath: string;
  outPath: string;
  verifiedPdfUrl?: string;
};

function printUsage(): void {
  console.log("Build canonical MC real-import JSON from AoPS JSON + searchable problems PDF");
  console.log("");
  console.log("Usage:");
  console.log(
    "  node --import tsx scripts/build-mc-real-import.ts --aops-json <path> --problems-pdf <path> --out <path> [--verified-pdf-url <url>]"
  );
}

function parseArgs(argv: string[]): BuildOptions {
  let aopsJsonPath: string | undefined;
  let problemsPdfPath: string | undefined;
  let outPath: string | undefined;
  let verifiedPdfUrl: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--aops-json") {
      if (!next) {
        throw new Error("Missing value for --aops-json");
      }
      aopsJsonPath = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--problems-pdf") {
      if (!next) {
        throw new Error("Missing value for --problems-pdf");
      }
      problemsPdfPath = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--out") {
      if (!next) {
        throw new Error("Missing value for --out");
      }
      outPath = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--verified-pdf-url") {
      if (!next) {
        throw new Error("Missing value for --verified-pdf-url");
      }
      verifiedPdfUrl = next.trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!aopsJsonPath || !problemsPdfPath || !outPath) {
    throw new Error("--aops-json, --problems-pdf, and --out are required");
  }

  return {
    aopsJsonPath,
    problemsPdfPath,
    outPath,
    verifiedPdfUrl
  };
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const { stdout } = await execFile(
    "gs",
    ["-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=txtwrite", "-sOutputFile=-", pdfPath],
    { maxBuffer: 32 * 1024 * 1024 }
  );

  return stdout;
}

function cleanEmbeddedChoices(statement: string): string {
  return statement
    .replace(/\s*\$?\\textbf\{\(A\)\s*\}[\s\S]*$/u, "")
    .trim();
}

function isLikelyProblemStartText(text: string): boolean {
  const normalized = text.trim();

  if (normalized.length < 8) {
    return false;
  }

  if (/^(?:A$|B$|February\b|AoPSCommunity\b|AMC\d|\d{4}AMC)/iu.test(normalized)) {
    return false;
  }

  return /[A-Za-z?$\d]/u.test(normalized);
}

function isLikelyFigureArtifactLine(text: string): boolean {
  const normalized = text.trim();

  if (!normalized) {
    return false;
  }

  if (/^[A-Z](?:\s+[A-Z])+$/u.test(normalized) || /^[xy]$/iu.test(normalized)) {
    return true;
  }

  return false;
}

function isIgnorablePdfLine(line: string): boolean {
  const normalized = line.trim();
  return (
    !normalized ||
    /^AoPSCommunity\b/u.test(normalized) ||
    /^AMC(?:8|10|12|12\/AHSME)\d/iu.test(normalized) ||
    /^©\d{4}AoPSIncorporated$/u.test(normalized) ||
    /^www\.artofproblemsolving\.com\//u.test(normalized) ||
    /^Art of Problem Solving is/u.test(normalized) ||
    /^These problems are copyright/u.test(normalized) ||
    /^https:\/\/data\.artofproblemsolving\.com\//u.test(normalized) ||
    /^Page \d+ of \d+$/u.test(normalized)
  );
}

export function extractSequentialProblemBlocks(text: string): Map<number, string[]> {
  const lines = text.replace(/\f/g, "\n").split(/\r?\n/);
  const blocks = new Map<number, string[]>();
  let started = false;
  let expectedProblemNumber = 1;
  let currentProblemNumber: number | null = null;

  for (const rawLine of lines) {
    if (isIgnorablePdfLine(rawLine)) {
      continue;
    }

    const problemMatch = /^(\s*)(\d{1,2})\s{2,}(.+)$/u.exec(rawLine);
    if (problemMatch) {
      const problemNumber = Number(problemMatch[2]);
      const lineTail = problemMatch[3].trim();

      if (!started) {
        if (problemNumber === 1 && isLikelyProblemStartText(lineTail)) {
          started = true;
          currentProblemNumber = 1;
          expectedProblemNumber = 2;
          blocks.set(1, [lineTail]);
        }

        continue;
      }

      if (problemNumber === 1 && expectedProblemNumber > 2 && isLikelyProblemStartText(lineTail)) {
        break;
      }

      if (problemNumber === expectedProblemNumber && isLikelyProblemStartText(lineTail)) {
        currentProblemNumber = problemNumber;
        expectedProblemNumber += 1;
        blocks.set(problemNumber, [lineTail]);
        continue;
      }
    }

    if (currentProblemNumber !== null) {
      blocks.get(currentProblemNumber)?.push(rawLine);
    }
  }

  return blocks;
}

export function extractRoutecheckProblemBlocks(text: string): Map<number, string[]> {
  const lines = text.replace(/\f/g, "\n").split(/\r?\n/);
  const blocks = new Map<number, string[]>();
  let currentProblemNumber: number | null = null;
  let seenAny = false;

  for (const rawLine of lines) {
    if (isIgnorablePdfLine(rawLine)) {
      continue;
    }

    const trimmed = rawLine.trim();
    const headingMatch = /^Problem (\d{1,2})$/u.exec(trimmed);
    if (headingMatch) {
      const problemNumber = Number(headingMatch[1]);
      if (seenAny && problemNumber === 1) {
        break;
      }
      seenAny = true;
      currentProblemNumber = problemNumber;
      blocks.set(problemNumber, []);
      continue;
    }

    if (currentProblemNumber === null) {
      continue;
    }

    if (/^\d+\s+Problem\s+\d+$/u.test(trimmed) || /^\d+\s+Solution\b/u.test(trimmed) || /^\d+\s+See also$/u.test(trimmed)) {
      continue;
    }

    blocks.get(currentProblemNumber)?.push(rawLine);
  }

  return blocks;
}

function splitLineByChoiceColumns(line: string, textStarts: number[]): string[] {
  const boundaries = textStarts.map((start, index) => {
    const next = textStarts[index + 1];
    return next === undefined ? line.length : Math.floor((start + next) / 2);
  });

  return textStarts.map((start, index) => {
    const end = boundaries[index];
    return line.slice(start, end).trim();
  });
}

function combineStackedMath(existing: string, continuation: string): string {
  const compactExisting = existing.replace(/\s+/gu, "");
  const compactContinuation = continuation.replace(/[,\s]+/gu, "");

  const mixedHalfMatch = /^(\d+)1$/u.exec(compactExisting);
  if (mixedHalfMatch && compactContinuation === "2") {
    return `${mixedHalfMatch[1]} \\frac{1}{2}`;
  }

  if (/^\d+$/u.test(compactExisting) && /^\d+$/u.test(compactContinuation)) {
    return `\\frac{${compactExisting}}{${compactContinuation}}`;
  }

  return `${existing} ${continuation}`;
}

function normalizeChoiceText(value: string): string {
  return value
    .replace(/©\d{4}AoPSIncorporated.*$/u, "")
    .replace(/https:\/\/data\.artofproblemsolving\.com\/.*$/u, "")
    .replace(/These problems are copy-.*$/u, "")
    .replace(/\b\d+\s+[AB]\s+\d+\s+February.*$/u, "")
    .replace(/\s+(?:[A-Z](?:\s+[A-Z])+)\s*$/u, "")
    .replace(/ûrst/gu, "first")
    .replace(/ûnal/gu, "final")
    .replace(/\s+/gu, " ")
    .trim();
}

export function extractChoicesFromBlock(blockLines: string[]): string[] {
  const choices: string[] = [];
  let currentChoiceIndex = -1;
  let pendingMultiColumnTextStarts: number[] | null = null;

  for (const rawLine of blockLines) {
    const line = rawLine.replace(/\t/gu, "    ");
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    const markerMatches = [...line.matchAll(/(?<![A-Za-z])\(([A-E])\)\s*/gu)];

    if (markerMatches.length > 0) {
      pendingMultiColumnTextStarts = null;

      if (markerMatches.length === 1) {
        const match = markerMatches[0];
        const textStart = match.index! + match[0].length;
        const text = line.slice(textStart).trim();
        choices.push(normalizeChoiceText(text));
        currentChoiceIndex = choices.length - 1;
        continue;
      }

      const textStarts = markerMatches.map((match) => match.index! + match[0].length);

      for (let index = 0; index < markerMatches.length; index += 1) {
        const start = textStarts[index];
        const nextMarkerIndex = markerMatches[index + 1]?.index ?? line.length;
        const textSegment = line.slice(start, nextMarkerIndex).trim();
        choices.push(normalizeChoiceText(textSegment));
        currentChoiceIndex = choices.length - 1;
      }

      pendingMultiColumnTextStarts = textStarts;
      continue;
    }

    const routecheckChoiceMatch = /^([A-E])\.\s*(.+)$/u.exec(trimmed);
    if (routecheckChoiceMatch) {
      pendingMultiColumnTextStarts = null;
      choices.push(normalizeChoiceText(routecheckChoiceMatch[2] ?? ""));
      currentChoiceIndex = choices.length - 1;
      continue;
    }

    if (
      pendingMultiColumnTextStarts &&
      /[\d√\/]/u.test(trimmed) &&
      !/[A-Za-z]{2,}/u.test(trimmed)
    ) {
      const continuations = splitLineByChoiceColumns(line, pendingMultiColumnTextStarts);
      const nonEmptyContinuations = continuations.filter((value) => value.trim().length > 0);

      if (nonEmptyContinuations.length !== continuations.length) {
        pendingMultiColumnTextStarts = null;
        continue;
      }

      for (let index = 0; index < continuations.length; index += 1) {
        const continuation = normalizeChoiceText(continuations[index] ?? "");
        if (!continuation) {
          continue;
        }

        const choiceIndex = choices.length - continuations.length + index;
        if (choiceIndex >= 0 && choices[choiceIndex]) {
          choices[choiceIndex] = normalizeChoiceText(combineStackedMath(choices[choiceIndex], continuation));
        }
      }

      pendingMultiColumnTextStarts = null;
      continue;
    }

    pendingMultiColumnTextStarts = null;

    if (currentChoiceIndex >= 0) {
      if (!isLikelyFigureArtifactLine(trimmed)) {
        choices[currentChoiceIndex] = normalizeChoiceText(`${choices[currentChoiceIndex]} ${trimmed}`);
      }
    }
  }

  return choices;
}

export function extractChoiceMapFromPdfText(text: string): Map<number, string[]> {
  const blocks = extractSequentialProblemBlocks(text);
  const fallbackBlocks = blocks.size > 0 ? blocks : extractRoutecheckProblemBlocks(text);
  const choiceMap = new Map<number, string[]>();

  for (const [problemNumber, blockLines] of fallbackBlocks.entries()) {
    const choices = extractChoicesFromBlock(blockLines);
    if (choices.length > 0) {
      choiceMap.set(problemNumber, choices);
    }
  }

  return choiceMap;
}

export function extractStatementFromBlock(blockLines: string[]): string {
  const statementLines: string[] = [];

  for (const rawLine of blockLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    if (/^(?:[A-E]\.\s+|\([A-E]\)\s*)/u.test(trimmed)) {
      break;
    }

    if (/^\d+\s+Problem\s+\d+$/u.test(trimmed) || /^\d+\s+Solution\b/u.test(trimmed) || /^\d+\s+See also$/u.test(trimmed)) {
      continue;
    }

    statementLines.push(trimmed);
  }

  return statementLines.join(" ").replace(/\s+/gu, " ").trim();
}

export function extractStatementMapFromPdfText(text: string): Map<number, string> {
  const blocks = extractSequentialProblemBlocks(text);
  const fallbackBlocks = blocks.size > 0 ? blocks : extractRoutecheckProblemBlocks(text);
  const statementMap = new Map<number, string>();

  for (const [problemNumber, blockLines] of fallbackBlocks.entries()) {
    const statement = extractStatementFromBlock(blockLines);
    if (statement) {
      statementMap.set(problemNumber, statement);
    }
  }

  return statementMap;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const aopsRaw = await readFile(options.aopsJsonPath, "utf8");
  const basePayload = JSON.parse(aopsRaw) as ImportProblemSetInput;
  const pdfText = await extractPdfText(options.problemsPdfPath);
  const choiceMap = extractChoiceMapFromPdfText(pdfText);
  const statementMap = extractStatementMapFromPdfText(pdfText);
  const setKey = getRealImportQualityFileSetKey(options.aopsJsonPath);

  const rawPayload: ImportProblemSetInput = {
    problemSet: {
      ...basePayload.problemSet,
      ...(options.verifiedPdfUrl ? { verifiedPdfUrl: options.verifiedPdfUrl } : {})
    },
    problems: basePayload.problems.map((problem) => {
      if (problem.answerFormat !== "MULTIPLE_CHOICE") {
        return {
          ...problem,
          statement: cleanEmbeddedChoices(problem.statement ?? statementMap.get(problem.number) ?? "")
        };
      }

      return {
        ...problem,
        statement: cleanEmbeddedChoices(problem.statement ?? statementMap.get(problem.number) ?? ""),
        choices: choiceMap.get(problem.number)
      };
    })
  };

  const validated = applyRealImportQuality(rawPayload, setKey);

  await mkdir(path.dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, JSON.stringify(validated, null, 2) + "\n", "utf8");

  console.log(`Wrote ${options.outPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    process.exitCode = 1;
  });
}
