import { prisma, type AnswerFormat, type Prisma } from "@arcmath/db";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateHint,
  getSafeFallbackHint,
  HINT_TUTOR_PROMPT_VERSION,
  hintLeaksFinalAnswer
} from "../lib/ai/hint-tutor";

type PrecomputeHintOptions = {
  problemSetId: string;
  force: boolean;
  limit?: number;
};

type PrecomputeHintResult = {
  scanned: number;
  generated: number;
  skippedCurated: number;
  skippedExisting: number;
  skippedIncomplete: number;
  failed: number;
};

type HintLevel = 1 | 2 | 3;

function sanitizeStoredHintText(value: string): string {
  return value
    .replace(/\u0000/gu, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .trim();
}

function printUsage(): void {
  console.log("Precompute Hint Tutor artifacts for one problem set");
  console.log("");
  console.log("Usage:");
  console.log(
    "  pnpm hint:precompute:neon -- --problem-set-id <problemSetId> [--force] [--limit N]"
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

export function parsePrecomputeHintArgs(argv: string[]): PrecomputeHintOptions {
  let problemSetId: string | undefined;
  let force = false;
  let limit: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--") {
      continue;
    }

    if (arg === "--problem-set-id") {
      if (!next) {
        throw new Error("Missing value for --problem-set-id");
      }
      problemSetId = next.trim();
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      limit = parsePositiveInt(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!problemSetId) {
    throw new Error("--problem-set-id is required");
  }

  return {
    problemSetId,
    force,
    limit
  };
}

function hasCuratedHints(problem: {
  curatedHintLevel1: string | null;
  curatedHintLevel2: string | null;
  curatedHintLevel3: string | null;
}): boolean {
  return [
    problem.curatedHintLevel1,
    problem.curatedHintLevel2,
    problem.curatedHintLevel3
  ].some((value) => (value?.trim().length ?? 0) > 0);
}

function hasGeneratedHints(problem: {
  generatedHintLevel1: string | null;
  generatedHintLevel2: string | null;
  generatedHintLevel3: string | null;
}): boolean {
  return [
    problem.generatedHintLevel1,
    problem.generatedHintLevel2,
    problem.generatedHintLevel3
  ].some((value) => (value?.trim().length ?? 0) > 0);
}

async function buildStoredHint(problem: {
  statement: string | null;
  answer: string | null;
  answerFormat: AnswerFormat;
  choices: Prisma.JsonValue | null;
  diagramImageAlt: string | null;
  solutionSketch: string | null;
}, level: HintLevel): Promise<string> {
  if (problem.answerFormat === "PROOF") {
    // Proof problems don't use precomputed hints — the proof tutor generates feedback per step.
    return sanitizeStoredHintText(getSafeFallbackHint(level).hintText);
  }
  if (problem.answerFormat === "WORKED_SOLUTION") {
    // WORKED_SOLUTION problems ship their official solution to the
    // student directly; there is no hint ladder to precompute. Keep the
    // fallback hint text so downstream code has something to store if
    // the pipeline ever tries to populate these rows.
    return sanitizeStoredHintText(getSafeFallbackHint(level).hintText);
  }
  const answerFormat = problem.answerFormat;
  const generated = await generateHint({
    problemStatement: problem.statement ?? "",
    answerFormat,
    choices: problem.choices,
    diagramImageAlt: problem.diagramImageAlt,
    hintLevel: level,
    solutionSketch: problem.solutionSketch
  });

  if (hintLeaksFinalAnswer(generated.hintText, problem.answer)) {
    return sanitizeStoredHintText(getSafeFallbackHint(level).hintText);
  }

  return sanitizeStoredHintText(generated.hintText);
}

export async function precomputeHintArtifacts(
  options: PrecomputeHintOptions
): Promise<PrecomputeHintResult> {
  const problemSet = await prisma.problemSet.findUnique({
    where: {
      id: options.problemSetId
    },
    select: {
      id: true,
      title: true
    }
  });

  if (!problemSet) {
    throw new Error(`Problem set not found: ${options.problemSetId}`);
  }

  const problems = await prisma.problem.findMany({
    where: {
      problemSetId: options.problemSetId
    },
    orderBy: {
      number: "asc"
    },
    ...(options.limit ? { take: options.limit } : {}),
    select: {
      id: true,
      number: true,
      statement: true,
      answer: true,
      answerFormat: true,
      choices: true,
      diagramImageAlt: true,
      solutionSketch: true,
      curatedHintLevel1: true,
      curatedHintLevel2: true,
      curatedHintLevel3: true,
      generatedHintLevel1: true,
      generatedHintLevel2: true,
      generatedHintLevel3: true
    }
  });

  console.log(`Precomputing hints for "${problemSet.title}" (${problemSet.id})`);

  const summary: PrecomputeHintResult = {
    scanned: problems.length,
    generated: 0,
    skippedCurated: 0,
    skippedExisting: 0,
    skippedIncomplete: 0,
    failed: 0
  };

  for (const problem of problems) {
    if (!problem.statement?.trim() || !problem.answer?.trim()) {
      summary.skippedIncomplete += 1;
      console.log(`- skipped #${problem.number}: missing statement or answer`);
      continue;
    }

    if (hasCuratedHints(problem)) {
      summary.skippedCurated += 1;
      console.log(`- skipped #${problem.number}: curated hints already exist`);
      continue;
    }

    if (!options.force && hasGeneratedHints(problem)) {
      summary.skippedExisting += 1;
      console.log(`- skipped #${problem.number}: generated hints already exist`);
      continue;
    }

    try {
      const level1 = await buildStoredHint(problem, 1);
      const level2 = await buildStoredHint(problem, 2);
      const level3 = await buildStoredHint(problem, 3);

      await prisma.problem.update({
        where: {
          id: problem.id
        },
        data: {
          generatedHintLevel1: level1,
          generatedHintLevel2: level2,
          generatedHintLevel3: level3,
          generatedHintPromptVersion: HINT_TUTOR_PROMPT_VERSION,
          generatedHintUpdatedAt: new Date()
        }
      });

      summary.generated += 1;
      console.log(`- generated #${problem.number}`);
    } catch (error) {
      summary.failed += 1;
      console.error(`- failed #${problem.number}`, {
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  return summary;
}

async function main(): Promise<void> {
  const options = parsePrecomputeHintArgs(process.argv.slice(2));
  const summary = await precomputeHintArtifacts(options);

  console.log("");
  console.log("Precomputed hint summary");
  console.log(`  scanned: ${summary.scanned}`);
  console.log(`  generated: ${summary.generated}`);
  console.log(`  skipped_curated: ${summary.skippedCurated}`);
  console.log(`  skipped_existing: ${summary.skippedExisting}`);
  console.log(`  skipped_incomplete: ${summary.skippedIncomplete}`);
  console.log(`  failed: ${summary.failed}`);

  if (summary.failed > 0) {
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
