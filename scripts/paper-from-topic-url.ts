import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../packages/db/src/client";
import type { ImportProblemSetInput } from "../packages/shared/src/import-schema";
import {
  fetchAoPSTopicImportFromUrl,
  type ResolvedSingleTopicMetadata,
  type TopicContentExtraction
} from "../packages/db/src/aops/fetch";
import { runImportCli, type ImportCliSummary } from "../packages/db/src/aops/import-cli";
import { generateAndCacheProblemSetPdf } from "../apps/web/src/lib/problem-set-pdf-generation";
import { getOfficialPdfStorageDriver } from "../apps/web/src/lib/official-pdf-storage";

export type PaperFromTopicUrlArgs = {
  url: string;
  workDir: string;
  dryRun: boolean;
  force: boolean;
};

export type PaperFromTopicUrlSummary = {
  sourceUrl: string;
  startedAt: string;
  finishedAt: string;
  resolvedMetadata: ResolvedSingleTopicMetadata | null;
  extraction: TopicContentExtraction | null;
  jsonOutputPath: string | null;
  import: {
    status: "success" | "failed" | "skipped";
    summary: ImportCliSummary | null;
    message: string | null;
  };
  generate: {
    status: "success" | "failed" | "skipped";
    message: string | null;
  };
  problemSetId: string | null;
  cachedPdfPath: string | null;
  cachedPdfSize: number | null;
  cachedPdfStatus: string | null;
  error: string | null;
};

type ExistingProblemSetRecord = {
  id: string;
};

type GenerationResult = Awaited<ReturnType<typeof generateAndCacheProblemSetPdf>>;

type PaperFromTopicDeps = {
  fetchTopicImport: (url: string) => Promise<{
    payload: ImportProblemSetInput;
    metadata: ResolvedSingleTopicMetadata;
    extraction: TopicContentExtraction;
  }>;
  writeJson: (filePath: string, payload: ImportProblemSetInput) => Promise<void>;
  importDir: (options: {
    dir: string;
    metadata: ResolvedSingleTopicMetadata;
    dryRun: boolean;
  }) => Promise<ImportCliSummary>;
  findProblemSet: (metadata: ResolvedSingleTopicMetadata) => Promise<ExistingProblemSetRecord | null>;
  generatePdf: (input: { problemSetId: string; force: boolean }) => Promise<GenerationResult>;
  getStorageDriver: () => "local" | "s3";
  writeSummary: (summaryPath: string, summary: PaperFromTopicUrlSummary) => Promise<void>;
  now: () => Date;
};

function getInvocationCwd(): string {
  return process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD) : process.cwd();
}

function resolveFromInvocationCwd(target: string): string {
  return path.resolve(getInvocationCwd(), target);
}

function buildJsonFileName(metadata: ResolvedSingleTopicMetadata): string {
  const examSegment = metadata.exam ? `_${metadata.exam}` : "";
  return `${metadata.contest}_${metadata.year}${examSegment}.json`;
}

export function resolvePaperWorkPaths(args: PaperFromTopicUrlArgs): {
  importsDir: string;
  summaryPath: string;
} {
  return {
    importsDir: path.join(args.workDir, "imports"),
    summaryPath: path.join(args.workDir, "summary.json")
  };
}

export function parsePaperFromTopicUrlArgs(args: string[]): PaperFromTopicUrlArgs {
  let url: string | undefined;
  let workDir: string | undefined;
  let dryRun = false;
  let force = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--url") {
      if (!next) {
        throw new Error("Missing value for --url");
      }
      url = next;
      index += 1;
      continue;
    }

    if (arg === "--work-dir") {
      if (!next) {
        throw new Error("Missing value for --work-dir");
      }
      workDir = resolveFromInvocationCwd(next);
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new Error("__HELP__");
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!url) {
    throw new Error("Missing required --url");
  }

  if (!workDir) {
    throw new Error("Missing required --work-dir");
  }

  return {
    url,
    workDir,
    dryRun,
    force
  };
}

function createDefaultDeps(): PaperFromTopicDeps {
  return {
    fetchTopicImport: (url) => fetchAoPSTopicImportFromUrl({ topicUrl: url }),
    writeJson: async (filePath, payload) => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    },
    importDir: ({ dir, metadata, dryRun }) =>
      runImportCli({
        dir,
        contests: [metadata.contest],
        yearFrom: metadata.year,
        yearTo: metadata.year,
        limitFiles: 1,
        dryRun
      }),
    findProblemSet: (metadata) =>
      prisma.problemSet.findFirst({
        where: {
          contest: metadata.contest,
          year: metadata.year,
          exam: metadata.exam ?? null
        },
        select: { id: true }
      }),
    generatePdf: ({ problemSetId, force }) =>
      generateAndCacheProblemSetPdf({
        prisma,
        problemSetId,
        force
      }),
    getStorageDriver: getOfficialPdfStorageDriver,
    writeSummary: async (summaryPath, summary) => {
      await mkdir(path.dirname(summaryPath), { recursive: true });
      await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    },
    now: () => new Date()
  };
}

export async function runPaperFromTopicUrl(
  args: PaperFromTopicUrlArgs,
  depsArg?: Partial<PaperFromTopicDeps>
): Promise<PaperFromTopicUrlSummary> {
  const deps: PaperFromTopicDeps = {
    ...createDefaultDeps(),
    ...depsArg
  };
  const startedAt = deps.now();
  const { importsDir, summaryPath } = resolvePaperWorkPaths(args);

  const summary: PaperFromTopicUrlSummary = {
    sourceUrl: args.url,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    resolvedMetadata: null,
    extraction: null,
    jsonOutputPath: null,
    import: {
      status: "skipped",
      summary: null,
      message: null
    },
    generate: {
      status: "skipped",
      message: null
    },
    problemSetId: null,
    cachedPdfPath: null,
    cachedPdfSize: null,
    cachedPdfStatus: null,
    error: null
  };

  try {
    const fetched = await deps.fetchTopicImport(args.url);
    summary.resolvedMetadata = fetched.metadata;
    summary.extraction = fetched.extraction;
    const jsonOutputPath = path.join(importsDir, buildJsonFileName(fetched.metadata));
    summary.jsonOutputPath = jsonOutputPath;

    await deps.writeJson(jsonOutputPath, fetched.payload);

    const importSummary = await deps.importDir({
      dir: importsDir,
      metadata: fetched.metadata,
      dryRun: args.dryRun
    });
    summary.import.summary = importSummary;
    if (importSummary.failedFiles > 0) {
      summary.import.status = "failed";
      summary.import.message = "Import failed for one or more files.";
      throw new Error(summary.import.message);
    }
    summary.import.status = "success";
    summary.import.message = args.dryRun ? "dry-run import preview only; no DB writes." : "import completed.";

    if (args.dryRun) {
      summary.generate.status = "skipped";
      summary.generate.message = "dry-run: skipped PDF generation and cache write.";
      summary.cachedPdfStatus = "SKIPPED_DRY_RUN";
      return summary;
    }

    const problemSet = await deps.findProblemSet(fetched.metadata);
    if (!problemSet) {
      throw new Error("Imported problem set could not be found in the database.");
    }
    summary.problemSetId = problemSet.id;

    if (deps.getStorageDriver() !== "local") {
      throw new Error("Single-paper pipeline requires OFFICIAL_PDF_STORAGE_DRIVER=local to report an exact local PDF path.");
    }

    const generation = await deps.generatePdf({
      problemSetId: problemSet.id,
      force: args.force
    });

    if (!generation.ok) {
      summary.cachedPdfStatus = generation.category === "missing-generation-source" ? "MISSING" : "FAILED";
      summary.generate.status = "failed";
      summary.generate.message = generation.message;
      throw new Error(generation.message);
    }

    if (!generation.cache) {
      summary.cachedPdfStatus = "FAILED";
      summary.generate.status = "failed";
      summary.generate.message = "cache-failed: generation succeeded but no cache metadata was returned.";
      throw new Error(summary.generate.message);
    }

    summary.generate.status = "success";
    summary.generate.message = `generated and cached ${generation.generatedProblemCount} problems.`;
    summary.cachedPdfPath = generation.cache.path;
    summary.cachedPdfSize = generation.cache.size;
    summary.cachedPdfStatus = generation.problemSet.cachedPdfStatus ?? "CACHED";
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (summary.import.status !== "success" && summary.import.message === null) {
      summary.import.status = "failed";
      summary.import.message = message;
    }
    if (summary.generate.status === "skipped" && !args.dryRun && summary.problemSetId !== null) {
      summary.generate.status = "failed";
      summary.generate.message = message;
    }
    summary.error = message;
    return summary;
  } finally {
    summary.finishedAt = deps.now().toISOString();
    await deps.writeSummary(summaryPath, summary);
  }
}

function printUsage() {
  console.log("Single paper from AoPS topic URL");
  console.log("");
  console.log("Usage:");
  console.log("  pnpm paper:from-topic-url --url <topic-url> --work-dir <path> [options]");
  console.log("");
  console.log("Options:");
  console.log("  --url <topic-url>     Direct AoPS community topic URL");
  console.log("  --work-dir <path>     Working directory for import JSON + summary");
  console.log("  --dry-run             Fetch/parse + import preview only; skip DB writes + PDF generation");
  console.log("  --force               Force PDF regeneration even if a cached PDF already exists");
}

async function main() {
  let args: PaperFromTopicUrlArgs;
  try {
    args = parsePaperFromTopicUrlArgs(process.argv.slice(2));
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

  const summary = await runPaperFromTopicUrl(args);

  if (summary.resolvedMetadata) {
    console.log("Resolved metadata");
    console.log(`  contest: ${summary.resolvedMetadata.contest}`);
    console.log(`  year: ${summary.resolvedMetadata.year}`);
    console.log(`  exam: ${summary.resolvedMetadata.exam ?? "none"}`);
  }

  if (summary.extraction) {
    console.log("Extraction");
    console.log(`  strategy: ${summary.extraction.strategy}`);
    console.log(`  attempted: ${summary.extraction.attemptedStrategies.join(", ")}`);
  }

  if (summary.jsonOutputPath) {
    console.log(`Import JSON: ${summary.jsonOutputPath}`);
  }

  if (summary.problemSetId) {
    console.log(`ProblemSet ID: ${summary.problemSetId}`);
  }

  if (summary.cachedPdfPath) {
    console.log(`Cached PDF: ${summary.cachedPdfPath}`);
    console.log(`Cached PDF size: ${summary.cachedPdfSize ?? 0}`);
  }

  const summaryPath = resolvePaperWorkPaths(args).summaryPath;
  console.log(`Summary: ${summaryPath}`);

  if (summary.error) {
    console.error(summary.error);
    process.exitCode = 1;
  }
}

const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === currentPath) {
  main()
    .catch(async (error) => {
      console.error("paper:from-topic-url failed", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect().catch(() => undefined);
    });
}
