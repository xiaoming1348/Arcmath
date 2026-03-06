import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@arcmath/db";
import {
  getLastCompleteYearsWindow,
  listScopedDownloadableProblemSets,
  type ResourceScopeRow
} from "../lib/resource-scope";
import { getResourcePdfResponse, type PdfVariant } from "../lib/resource-pdf-delivery";
import {
  expectedProblemCount,
  extractTextWithGhostscript,
  verifyExtractedText,
  type VariantVerification
} from "./render-verify";

export type ValidateSearchableSummary = {
  startedAt: string;
  finishedAt: string;
  yearWindow: {
    yearFrom: number;
    yearTo: number;
  };
  totalSearchableSets: number;
  byContest: Record<string, number>;
  totals: {
    checkedVariants: number;
    routeFailures: number;
    qualityFailures: number;
  };
  failures: Array<{
    problemSetId: string;
    contest: string;
    year: number;
    exam: string | null;
    variant: PdfVariant;
    reason: string;
    routeStatus: number;
  }>;
  passed: boolean;
  reportPath: string;
};

type ValidateOptions = {
  outDir: string;
  reportPath?: string;
  userId?: string;
};

function parseArgs(argv: string[]): ValidateOptions {
  let outDir: string | null = null;
  let reportPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--out-dir") {
      if (!next) {
        throw new Error("Missing value for --out-dir");
      }
      outDir = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--report") {
      if (!next) {
        throw new Error("Missing value for --report");
      }
      reportPath = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new Error("__HELP__");
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!outDir) {
    throw new Error("--out-dir is required");
  }

  return {
    outDir,
    reportPath
  };
}

function printUsage(): void {
  console.log("Validate searchable resource downloads");
  console.log("");
  console.log("Usage:");
  console.log("  pnpm -C apps/web pdf:validate-searchable --out-dir tmp/last10-materialize");
}

function countByContest(rows: ResourceScopeRow[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.contest, (counts.get(row.contest) ?? 0) + 1);
  }

  const result: Record<string, number> = {};
  for (const [contest, count] of counts.entries()) {
    result[contest] = count;
  }
  return result;
}

async function verifyVariantContent(input: {
  row: ResourceScopeRow;
  variant: PdfVariant;
  response: Response;
  outDir: string;
}): Promise<VariantVerification> {
  const bytes = Buffer.from(await input.response.arrayBuffer());
  const fileName = `${input.row.contest}_${input.row.year}_${input.row.exam ?? "none"}_${input.variant}_routecheck.pdf`;
  const pdfPath = path.join(input.outDir, fileName);
  await writeFile(pdfPath, bytes);

  const text = await extractTextWithGhostscript(pdfPath);
  return verifyExtractedText({
    text,
    expectedMarkers: expectedProblemCount(input.row.contest),
    pdfPath,
    texLeakThreshold: 2
  });
}

export async function runValidateSearchableDownloads(options: ValidateOptions): Promise<ValidateSearchableSummary> {
  const startedAt = new Date().toISOString();
  const window = getLastCompleteYearsWindow();
  const outDir = path.resolve(options.outDir);
  await mkdir(outDir, { recursive: true });

  const rows = await listScopedDownloadableProblemSets({ prisma });
  const failures: ValidateSearchableSummary["failures"] = [];

  let checkedVariants = 0;
  let routeFailures = 0;
  let qualityFailures = 0;

  for (const row of rows) {
    for (const variant of ["problems", "answers"] as const) {
      checkedVariants += 1;
      const response = await getResourcePdfResponse({
        prisma,
        userId: options.userId ?? "admin-validator",
        hasMembership: true,
        problemSetId: row.id,
        variant
      });

      if (response.status === 409 || response.status >= 500 || response.status === 404) {
        routeFailures += 1;
        failures.push({
          problemSetId: row.id,
          contest: row.contest,
          year: row.year,
          exam: row.exam,
          variant,
          reason: `route_status_${response.status}`,
          routeStatus: response.status
        });
        continue;
      }

      if (response.status !== 200) {
        continue;
      }

      const verification = await verifyVariantContent({
        row,
        variant,
        response,
        outDir
      });
      if (!verification.passed) {
        qualityFailures += 1;
        failures.push({
          problemSetId: row.id,
          contest: row.contest,
          year: row.year,
          exam: row.exam,
          variant,
          reason: `quality_failed(markers=${verification.detectedProblemMarkers},tex=${verification.texLeakCount},lastPage=${verification.hasNonWhitespaceLastPage})`,
          routeStatus: 200
        });
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const reportPath = options.reportPath
    ? path.resolve(options.reportPath)
    : path.join(outDir, "searchable-downloads-validation.json");

  const summary: ValidateSearchableSummary = {
    startedAt,
    finishedAt,
    yearWindow: window,
    totalSearchableSets: rows.length,
    byContest: countByContest(rows),
    totals: {
      checkedVariants,
      routeFailures,
      qualityFailures
    },
    failures,
    passed: failures.length === 0,
    reportPath
  };

  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summary;
}

async function main(): Promise<void> {
  let options: ValidateOptions;
  try {
    options = parseArgs(process.argv.slice(2));
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

  const summary = await runValidateSearchableDownloads(options);

  console.log("Searchable download validation summary");
  console.log(`  year window: ${summary.yearWindow.yearFrom}-${summary.yearWindow.yearTo}`);
  console.log(`  searchable sets: ${summary.totalSearchableSets}`);
  console.log(`  checked variants: ${summary.totals.checkedVariants}`);
  console.log(`  route failures: ${summary.totals.routeFailures}`);
  console.log(`  quality failures: ${summary.totals.qualityFailures}`);
  console.log(`  report: ${summary.reportPath}`);

  if (!summary.passed) {
    process.exitCode = 1;
  }
}

const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === currentPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
