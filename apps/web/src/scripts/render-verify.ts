import type { Contest } from "@arcmath/db";
import { prisma } from "@arcmath/db";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateAndCacheProblemSetPdf } from "../lib/problem-set-pdf-generation";

const execFile = promisify(execFileCallback);

const VALID_CONTESTS: Contest[] = ["AMC8", "AMC10", "AMC12", "AIME"];

export type RenderVerifyOptions = {
  contest: Contest;
  year: number;
  exam: string | null;
  outDir: string;
};

export type VariantVerification = {
  pdfPath: string;
  pageCount: number;
  detectedProblemMarkers: number;
  texLeakCount: number;
  hasNonWhitespaceLastPage: boolean;
  passed: boolean;
};

export type RenderVerifyReport = {
  startedAt: string;
  finishedAt: string;
  contest: Contest;
  year: number;
  exam: string | null;
  expectedProblemCount: number;
  artifacts: {
    problemsPdf: string;
    answersPdf: string;
    verifyJson: string;
  };
  cached: {
    problemsPath: string;
    answersPath: string;
  };
  checks: {
    problems: VariantVerification;
    answers: VariantVerification;
  };
  passed: boolean;
};

function printUsage(): void {
  console.log("Render and verify generated problem-set PDFs");
  console.log("");
  console.log("Usage:");
  console.log(
    "  pnpm -C apps/web pdf:render-verify --contest AMC12 --year 2025 --exam A --out-dir tmp/pdf-verify"
  );
}

function parsePositiveInt(flag: string, value: string | undefined): number {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export function parseRenderVerifyArgs(argv: string[]): RenderVerifyOptions {
  let contest: Contest | undefined;
  let year: number | undefined;
  let exam: string | null | undefined;
  let outDir: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--contest") {
      if (!next) {
        throw new Error("Missing value for --contest");
      }
      const parsed = next.toUpperCase() as Contest;
      if (!VALID_CONTESTS.includes(parsed)) {
        throw new Error("--contest must be AMC8|AMC10|AMC12|AIME");
      }
      contest = parsed;
      index += 1;
      continue;
    }

    if (arg === "--year") {
      year = parsePositiveInt(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--exam") {
      if (!next) {
        throw new Error("Missing value for --exam");
      }
      const normalized = next.trim().toUpperCase();
      exam = normalized.length > 0 ? normalized : null;
      index += 1;
      continue;
    }

    if (arg === "--out-dir") {
      if (!next) {
        throw new Error("Missing value for --out-dir");
      }
      outDir = next;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!contest) {
    throw new Error("--contest is required");
  }
  if (!year) {
    throw new Error("--year is required");
  }
  if (!outDir) {
    throw new Error("--out-dir is required");
  }

  if (contest === "AMC8") {
    exam = null;
  } else if (!exam) {
    throw new Error("--exam is required for AMC10/AMC12/AIME");
  }

  if (contest === "AMC10" || contest === "AMC12") {
    if (exam !== "A" && exam !== "B") {
      throw new Error("--exam must be A or B for AMC10/AMC12");
    }
  }

  if (contest === "AIME") {
    if (exam !== "I" && exam !== "II") {
      throw new Error("--exam must be I or II for AIME");
    }
  }

  return { contest, year, exam: exam ?? null, outDir };
}

export function expectedProblemCount(contest: Contest): number {
  return contest === "AIME" ? 15 : 25;
}

export function countProblemMarkers(text: string): number {
  return (text.match(/\bProblem\s+\d+\b/gi) ?? []).length;
}

export function countTexLeakage(text: string): number {
  return (
    text.match(/\\(?:frac|sqrt|textbf|begin|end|cdot|times|le|ge|neq|pi|theta)|\$/g) ?? []
  ).length;
}

export function splitExtractedPages(text: string): string[] {
  const chunks = text.split("\f");
  if (chunks.length > 1 && chunks[chunks.length - 1] === "") {
    chunks.pop();
  }
  return chunks;
}

export async function extractTextWithGhostscript(pdfPath: string): Promise<string> {
  try {
    const { stdout } = await execFile(
      "gs",
      ["-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=txtwrite", "-sOutputFile=-", pdfPath],
      { maxBuffer: 32 * 1024 * 1024 }
    );
    return stdout;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") {
      throw new Error("Ghostscript not found. Install 'gs' to run pdf:render-verify.");
    }
    throw error;
  }
}

export function verifyExtractedText(input: {
  text: string;
  expectedMarkers: number;
  texLeakThreshold?: number;
  pdfPath: string;
}): VariantVerification {
  const pages = splitExtractedPages(input.text);
  const detectedProblemMarkers = countProblemMarkers(input.text);
  const texLeakCount = countTexLeakage(input.text);
  const hasNonWhitespaceLastPage = pages.length > 0 && pages[pages.length - 1].trim().length > 0;
  const texLeakThreshold = input.texLeakThreshold ?? 2;

  return {
    pdfPath: input.pdfPath,
    pageCount: pages.length,
    detectedProblemMarkers,
    texLeakCount,
    hasNonWhitespaceLastPage,
    passed:
      detectedProblemMarkers >= input.expectedMarkers &&
      texLeakCount <= texLeakThreshold &&
      hasNonWhitespaceLastPage
  };
}

function toStem(input: RenderVerifyOptions): string {
  return `${input.contest}_${input.year}_${input.exam ?? "none"}`;
}

export async function runRenderVerify(options: RenderVerifyOptions): Promise<RenderVerifyReport> {
  const startedAt = new Date().toISOString();

  const problemSet = await prisma.problemSet.findFirst({
    where: {
      contest: options.contest,
      year: options.year,
      exam: options.exam
    },
    select: {
      id: true,
      contest: true,
      year: true,
      exam: true
    }
  });

  if (!problemSet) {
    throw new Error(
      `Problem set not found for ${options.contest} ${options.year}${options.exam ? ` ${options.exam}` : ""}.`
    );
  }

  const problemsGeneration = await generateAndCacheProblemSetPdf({
    prisma,
    problemSetId: problemSet.id,
    variant: "problems",
    force: true
  });

  if (!problemsGeneration.ok) {
    throw new Error(`Problems generation failed: ${problemsGeneration.message}`);
  }

  const answersGeneration = await generateAndCacheProblemSetPdf({
    prisma,
    problemSetId: problemSet.id,
    variant: "answers",
    force: true
  });

  if (!answersGeneration.ok) {
    throw new Error(`Answers generation failed: ${answersGeneration.message}`);
  }

  const stem = toStem(options);
  const outDirPath = path.resolve(options.outDir);
  await mkdir(outDirPath, { recursive: true });

  const problemsPdfPath = path.join(outDirPath, `${stem}_problems.pdf`);
  const answersPdfPath = path.join(outDirPath, `${stem}_answers.pdf`);
  const verifyJsonPath = path.join(outDirPath, `${stem}_verify.json`);

  await writeFile(problemsPdfPath, problemsGeneration.pdfBytes);
  await writeFile(answersPdfPath, answersGeneration.pdfBytes);

  const problemsText = await extractTextWithGhostscript(problemsPdfPath);
  const answersText = await extractTextWithGhostscript(answersPdfPath);

  const expectedCount = expectedProblemCount(options.contest);
  const problemsCheck = verifyExtractedText({
    text: problemsText,
    expectedMarkers: expectedCount,
    pdfPath: problemsPdfPath
  });
  const answersCheck = verifyExtractedText({
    text: answersText,
    expectedMarkers: expectedCount,
    pdfPath: answersPdfPath
  });

  const finishedAt = new Date().toISOString();
  const report: RenderVerifyReport = {
    startedAt,
    finishedAt,
    contest: options.contest,
    year: options.year,
    exam: options.exam,
    expectedProblemCount: expectedCount,
    artifacts: {
      problemsPdf: problemsPdfPath,
      answersPdf: answersPdfPath,
      verifyJson: verifyJsonPath
    },
    cached: {
      problemsPath: problemsGeneration.cache?.path ?? "",
      answersPath: answersGeneration.cache?.path ?? ""
    },
    checks: {
      problems: problemsCheck,
      answers: answersCheck
    },
    passed: problemsCheck.passed && answersCheck.passed
  };

  await writeFile(verifyJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function main(): Promise<void> {
  const options = parseRenderVerifyArgs(process.argv.slice(2));
  const report = await runRenderVerify(options);

  console.log(`Problems PDF: ${report.artifacts.problemsPdf}`);
  console.log(`Answers PDF: ${report.artifacts.answersPdf}`);
  console.log(`Verify JSON: ${report.artifacts.verifyJson}`);
  console.log(`Problems pages: ${report.checks.problems.pageCount}`);
  console.log(`Answers pages: ${report.checks.answers.pageCount}`);
  console.log(`Problems markers: ${report.checks.problems.detectedProblemMarkers}`);
  console.log(`Answers markers: ${report.checks.answers.detectedProblemMarkers}`);
  console.log(`Problems TeX leaks: ${report.checks.problems.texLeakCount}`);
  console.log(`Answers TeX leaks: ${report.checks.answers.texLeakCount}`);
  console.log(`Result: ${report.passed ? "PASS" : "FAIL"}`);

  if (!report.passed) {
    process.exitCode = 1;
  }
}

const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === currentPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    process.exitCode = 1;
  });
}
