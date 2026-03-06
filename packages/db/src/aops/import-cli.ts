import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { prisma } from "../client";
import { importProblemSetSchema, type Contest, type ImportProblemSetInput } from "@arcmath/shared";

type ImportStats = {
  setsCreated: number;
  setsUpdated: number;
  problemsCreated: number;
  problemsUpdated: number;
  problemsSkipped: number;
  failedFiles: number;
};

export type ImportCliOptions = {
  dir: string;
  contests?: Contest[];
  yearFrom?: number;
  yearTo?: number;
  limitFiles?: number;
  dryRun: boolean;
};

export type ImportCliSummary = ImportStats & {
  files: number;
  filesMatched: number;
  filesSkippedByFilter: number;
  filesSkippedByLimit: number;
  dryRun: boolean;
};

type ImportDeps = {
  listDir: (dir: string) => Promise<string[]>;
  readText: (filePath: string) => Promise<string>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  importPayload: (payload: ImportProblemSetInput, stats: ImportStats) => Promise<void>;
};

const VALID_CONTESTS: Contest[] = ["AMC8", "AMC10", "AMC12", "AIME"];

function getInvocationCwd(): string {
  return process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD) : process.cwd();
}

function resolveFromInvocationCwd(target: string): string {
  const base = getInvocationCwd();
  return path.resolve(base, target);
}

function suggestTitle(input: ImportProblemSetInput["problemSet"]): string {
  if (input.contest === "AMC8") {
    return `AMC 8 ${input.year}`;
  }
  if (input.contest === "AMC10") {
    return `AMC 10${input.exam ?? ""} ${input.year}`;
  }
  if (input.contest === "AMC12") {
    return `AMC 12${input.exam ?? ""} ${input.year}`;
  }
  return `AIME ${input.exam ?? ""} ${input.year}`;
}

async function importOne(payload: ImportProblemSetInput, stats: ImportStats) {
  await prisma.$transaction(async (tx) => {
    const existingSet = await tx.problemSet.findFirst({
      where: {
        contest: payload.problemSet.contest,
        year: payload.problemSet.year,
        exam: payload.problemSet.exam ?? null
      }
    });

    const title = suggestTitle(payload.problemSet);
    const set = existingSet
      ? await tx.problemSet.update({
          where: { id: existingSet.id },
          data: {
            title,
            sourceUrl: payload.problemSet.sourceUrl ?? existingSet.sourceUrl,
            verifiedPdfUrl: payload.problemSet.verifiedPdfUrl ?? existingSet.verifiedPdfUrl
          }
        })
      : await tx.problemSet.create({
          data: {
            contest: payload.problemSet.contest,
            year: payload.problemSet.year,
            exam: payload.problemSet.exam ?? null,
            title,
            sourceUrl: payload.problemSet.sourceUrl,
            verifiedPdfUrl: payload.problemSet.verifiedPdfUrl
          }
        });

    if (existingSet) {
      stats.setsUpdated += 1;
    } else {
      stats.setsCreated += 1;
    }

    for (const problem of payload.problems) {
      const existingProblem = await tx.problem.findUnique({
        where: {
          problemSetId_number: {
            problemSetId: set.id,
            number: problem.number
          }
        }
      });

      if (!existingProblem) {
        await tx.problem.create({
          data: {
            problemSetId: set.id,
            number: problem.number,
            statement: problem.statement,
            statementFormat: problem.statementFormat ?? "MARKDOWN_LATEX",
            choices: problem.choices,
            answer: problem.answer,
            answerFormat: problem.answerFormat ?? "MULTIPLE_CHOICE",
            sourceUrl: problem.sourceUrl
          }
        });
        stats.problemsCreated += 1;
        continue;
      }

      const updateData = {
        statement: problem.statement ?? existingProblem.statement,
        statementFormat: problem.statementFormat ?? existingProblem.statementFormat,
        choices: problem.choices ?? existingProblem.choices,
        answer: problem.answer ?? existingProblem.answer,
        answerFormat: problem.answerFormat ?? existingProblem.answerFormat,
        sourceUrl: problem.sourceUrl ?? existingProblem.sourceUrl
      };

      const changed =
        updateData.statement !== existingProblem.statement ||
        updateData.statementFormat !== existingProblem.statementFormat ||
        JSON.stringify(updateData.choices) !== JSON.stringify(existingProblem.choices) ||
        updateData.answer !== existingProblem.answer ||
        updateData.answerFormat !== existingProblem.answerFormat ||
        updateData.sourceUrl !== existingProblem.sourceUrl;

      if (!changed) {
        stats.problemsSkipped += 1;
        continue;
      }

      await tx.problem.update({
        where: { id: existingProblem.id },
        data: updateData
      });
      stats.problemsUpdated += 1;
    }
  });
}

function parseNonNegativeInteger(flag: string, raw: string | undefined): number {
  if (!raw) {
    throw new Error(`Missing value for ${flag}`);
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

function parseContestToken(value: string): Contest {
  const normalized = value.trim().toUpperCase();
  if (VALID_CONTESTS.includes(normalized as Contest)) {
    return normalized as Contest;
  }
  throw new Error(`Invalid contest "${value}". Must be AMC8|AMC10|AMC12|AIME`);
}

export function parseImportArgs(args: string[]): ImportCliOptions {
  let dir = resolveFromInvocationCwd("data/aops-imports");
  const contests: Contest[] = [];
  const options: ImportCliOptions = {
    dir,
    dryRun: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--dir") {
      if (!next) {
        throw new Error("Missing value for --dir");
      }
      dir = resolveFromInvocationCwd(next);
      index += 1;
      continue;
    }

    if (arg === "--contest") {
      if (!next) {
        throw new Error("Missing value for --contest");
      }
      const parsed = next
        .split(",")
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
        .map(parseContestToken);
      contests.push(...parsed);
      index += 1;
      continue;
    }

    if (arg === "--year-from") {
      options.yearFrom = parseNonNegativeInteger(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--year-to") {
      options.yearTo = parseNonNegativeInteger(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--limit-files") {
      const parsed = parseNonNegativeInteger(arg, next);
      if (parsed < 1) {
        throw new Error("--limit-files must be >= 1");
      }
      options.limitFiles = parsed;
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new Error("__HELP__");
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.yearFrom !== undefined && options.yearTo !== undefined && options.yearFrom > options.yearTo) {
    throw new Error("--year-from cannot be greater than --year-to");
  }

  options.dir = dir;
  options.contests = contests.length > 0 ? [...new Set(contests)] : undefined;
  return options;
}

function createImportStats(): ImportStats {
  return {
    setsCreated: 0,
    setsUpdated: 0,
    problemsCreated: 0,
    problemsUpdated: 0,
    problemsSkipped: 0,
    failedFiles: 0
  };
}

function toShortError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isLikelyImportPayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return "problemSet" in candidate && "problems" in candidate;
}

function matchesImportScope(payload: ImportProblemSetInput, options: ImportCliOptions): boolean {
  if (options.contests && options.contests.length > 0 && !options.contests.includes(payload.problemSet.contest)) {
    return false;
  }
  if (options.yearFrom !== undefined && payload.problemSet.year < options.yearFrom) {
    return false;
  }
  if (options.yearTo !== undefined && payload.problemSet.year > options.yearTo) {
    return false;
  }
  return true;
}

function createDefaultDeps(): ImportDeps {
  return {
    listDir: readdir,
    readText: (filePath) => readFile(filePath, "utf8"),
    connect: async () => prisma.$connect(),
    disconnect: async () => prisma.$disconnect(),
    importPayload: importOne
  };
}

export async function runImportCli(
  options: ImportCliOptions,
  depsArg?: Partial<ImportDeps>
): Promise<ImportCliSummary> {
  const deps: ImportDeps = {
    ...createDefaultDeps(),
    ...depsArg
  };

  const entries = await deps.listDir(options.dir);
  const files = entries.filter((name) => name.endsWith(".json")).sort();

  const stats = createImportStats();
  let filesSkippedByFilter = 0;
  let filesSkippedByLimit = 0;
  const matchedFiles: Array<{ fileName: string; payload: ImportProblemSetInput }> = [];

  for (const fileName of files) {
    const fullPath = path.join(options.dir, fileName);
    try {
      const raw = await deps.readText(fullPath);
      const parsedJson = JSON.parse(raw);
      if (!isLikelyImportPayload(parsedJson)) {
        filesSkippedByFilter += 1;
        continue;
      }
      const parsed = importProblemSetSchema.safeParse(parsedJson);
      if (!parsed.success) {
        stats.failedFiles += 1;
        console.error(`invalid schema: ${fileName}`);
        continue;
      }

      if (!matchesImportScope(parsed.data, options)) {
        filesSkippedByFilter += 1;
        continue;
      }

      matchedFiles.push({
        fileName,
        payload: parsed.data
      });
    } catch (error) {
      stats.failedFiles += 1;
      console.error(`failed: ${fileName} - ${toShortError(error)}`);
    }
  }

  const filesMatched = matchedFiles.length;
  const filesToProcess =
    options.limitFiles !== undefined ? matchedFiles.slice(0, options.limitFiles) : matchedFiles;
  filesSkippedByLimit = filesMatched - filesToProcess.length;

  if (!options.dryRun) {
    await deps.connect();
  }

  try {
    for (const item of filesToProcess) {
      if (options.dryRun) {
        console.log(`preview: ${item.fileName}`);
        continue;
      }

      try {
        await deps.importPayload(item.payload, stats);
        console.log(`imported: ${item.fileName}`);
      } catch (error) {
        stats.failedFiles += 1;
        console.error(`failed: ${item.fileName} - ${toShortError(error)}`);
      }
    }
  } finally {
    if (!options.dryRun) {
      await deps.disconnect();
    }
  }

  return {
    files: files.length,
    filesMatched,
    filesSkippedByFilter,
    filesSkippedByLimit,
    dryRun: options.dryRun,
    ...stats
  };
}

function printUsage() {
  console.log("AoPS bulk import tool");
  console.log("");
  console.log("Usage:");
  console.log("  pnpm -C packages/db aops:import --dir <path> [options]");
  console.log("");
  console.log("Options:");
  console.log("  --dir <path>               Input JSON directory (default: data/aops-imports)");
  console.log("  --contest <list>           Repeatable or csv: AMC8,AMC10,AMC12,AIME");
  console.log("  --year-from <n>            Lower year bound");
  console.log("  --year-to <n>              Upper year bound");
  console.log("  --limit-files <n>          Max matched files to process");
  console.log("  --dry-run                  Preview only; no DB writes");
}

async function main() {
  let options: ImportCliOptions;
  try {
    options = parseImportArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "__HELP__") {
      printUsage();
      return;
    }
    console.error(message);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const summary = await runImportCli(options);

  console.log("Bulk import summary");
  console.log(`  files: ${summary.files}`);
  console.log(`  files matched: ${summary.filesMatched}`);
  console.log(`  files skipped by filter: ${summary.filesSkippedByFilter}`);
  console.log(`  files skipped by limit: ${summary.filesSkippedByLimit}`);
  console.log(`  failed files: ${summary.failedFiles}`);
  console.log(`  sets created: ${summary.setsCreated}`);
  console.log(`  sets updated: ${summary.setsUpdated}`);
  console.log(`  problems created: ${summary.problemsCreated}`);
  console.log(`  problems updated: ${summary.problemsUpdated}`);
  console.log(`  problems skipped: ${summary.problemsSkipped}`);
  if (summary.dryRun) {
    console.log("  mode: dry-run (no DB writes)");
  }

  if (summary.failedFiles > 0) {
    process.exitCode = 1;
  }
}

const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === currentPath) {
  main().catch((error) => {
    console.error("aops import failed", error);
    process.exitCode = 1;
  });
}
