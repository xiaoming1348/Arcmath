/**
 * Insert admissions-track contest manifests (Euclid / MAT / STEP / USAMO)
 * into the ProblemSet+Problem tables so the content can be rendered,
 * assigned, and graded through the regular student/teacher flows.
 *
 * This is the "last mile" that wires the hand-authored JSON manifests
 * in `packages/ingest-*` into the database. It deliberately stays
 * read-only until the uploader id is resolved and the JSON parses —
 * nothing touches the DB until the whole manifest passes schema
 * validation.
 *
 * Expected invocation (run locally against your dev DB):
 *
 *   bash scripts/with-env-local.sh \
 *     pnpm -C apps/web exec tsx src/scripts/import-admissions-manifests.ts \
 *       --contest euclid \
 *       --uploader-email admin@arcmath.ai
 *
 * Flags:
 *   --contest euclid|mat|step|usamo   Pick the manifest package.
 *   --manifest-dir <path>             Override the default manifest dir.
 *   --uploader-email <email>          User whose id is recorded on the
 *                                     ImportJob row (required — we refuse
 *                                     to insert rows without a real owner).
 *   --dry-run                         Parse and validate only; no DB
 *                                     writes, no ImportJob row.
 *
 * The script is intentionally a thin CLI around `commitImportFromJson`
 * (apps/web/src/lib/imports/contest-import.ts) so the ingest path is
 * the exact same one the admin upload form uses. That guarantees the
 * audit + warning surfaces stay identical between manual and scripted
 * imports.
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import { prisma } from "@arcmath/db";
import type { ImportProblemSetInput } from "@arcmath/shared";
import {
  EUCLID_MANIFEST_DIR,
  loadAllEuclidManifests
} from "@arcmath/ingest-cemc";
import {
  MAT_MANIFEST_DIR,
  loadAllMatManifests
} from "@arcmath/ingest-oxford-mat";
import {
  STEP_MANIFEST_DIR,
  loadAllStepManifests
} from "@arcmath/ingest-cambridge-step";
import {
  USAMO_MANIFEST_DIR,
  loadAllUsamoManifests
} from "@arcmath/ingest-maa-usamo";
import { commitImportFromJson } from "../lib/imports/contest-import";

type ContestKey = "euclid" | "mat" | "step" | "usamo";

type CliFlags = {
  contest: ContestKey;
  manifestDir: string | null;
  uploaderEmail: string | null;
  dryRun: boolean;
};

/**
 * Shape every per-contest loader collapses to. Each package has its own
 * concrete result type, but they're structurally identical (same
 * discriminated union), so the CLI can treat them uniformly.
 */
type GenericLoadResult =
  | { ok: true; manifestPath: string; data: ImportProblemSetInput }
  | { ok: false; manifestPath: string; errors: string[] };

type ContestAdapter = {
  label: string;
  defaultManifestDir: string;
  loadAll: (options: { manifestDir?: string }) => Promise<GenericLoadResult[]>;
};

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    contest: "euclid",
    manifestDir: null,
    uploaderEmail: null,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--contest" && value) {
      if (value !== "euclid" && value !== "mat" && value !== "step" && value !== "usamo") {
        throw new Error(`--contest must be one of euclid|mat|step|usamo; got ${value}`);
      }
      flags.contest = value;
      index += 1;
    } else if (flag === "--manifest-dir" && value) {
      flags.manifestDir = path.resolve(value);
      index += 1;
    } else if (flag === "--uploader-email" && value) {
      flags.uploaderEmail = value;
      index += 1;
    } else if (flag === "--dry-run") {
      flags.dryRun = true;
    } else {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }

  return flags;
}

function getContestAdapter(contest: ContestKey): ContestAdapter {
  switch (contest) {
    case "euclid":
      return {
        label: "EUCLID",
        defaultManifestDir: EUCLID_MANIFEST_DIR,
        loadAll: (options) => loadAllEuclidManifests(options)
      };
    case "mat":
      return {
        label: "MAT",
        defaultManifestDir: MAT_MANIFEST_DIR,
        loadAll: (options) => loadAllMatManifests(options)
      };
    case "step":
      return {
        label: "STEP",
        defaultManifestDir: STEP_MANIFEST_DIR,
        loadAll: (options) => loadAllStepManifests(options)
      };
    case "usamo":
      return {
        label: "USAMO",
        defaultManifestDir: USAMO_MANIFEST_DIR,
        loadAll: (options) => loadAllUsamoManifests(options)
      };
  }
}

async function resolveUploaderId(email: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true }
  });
  if (!user) {
    throw new Error(`Uploader email ${email} not found — create the user before importing.`);
  }
  return user.id;
}

async function runImport(
  adapter: ContestAdapter,
  options: { manifestDir: string; uploaderEmail: string | null; dryRun: boolean }
): Promise<number> {
  const results = await adapter.loadAll({ manifestDir: options.manifestDir });
  const failures = results.filter((entry) => !entry.ok);
  if (failures.length > 0) {
    console.error(`Refusing to proceed — ${failures.length} manifest(s) failed validation.`);
    for (const entry of failures) {
      if (!entry.ok) {
        console.error(`  ${path.basename(entry.manifestPath)}:`);
        for (const error of entry.errors) {
          console.error(`    - ${error}`);
        }
      }
    }
    return 1;
  }

  if (options.dryRun) {
    for (const entry of results) {
      if (entry.ok) {
        console.log(
          `dry-run ok: ${path.basename(entry.manifestPath)} — ${adapter.label} ${entry.data.problemSet.year} (${entry.data.problems.length} problems)`
        );
      }
    }
    return 0;
  }

  if (!options.uploaderEmail) {
    console.error("--uploader-email is required (ImportJob.uploadedByUserId must reference a real user).");
    return 1;
  }
  const uploadedByUserId = await resolveUploaderId(options.uploaderEmail);

  for (const entry of results) {
    if (!entry.ok) continue;
    const jsonText = await readFile(entry.manifestPath, "utf8");
    const filename = path.basename(entry.manifestPath);
    const commit = await commitImportFromJson({
      prisma,
      jsonText,
      filename,
      uploadedByUserId
    });
    console.log(
      `imported ${filename}: problemSetId=${commit.problemSetId} created=${commit.createdProblems} updated=${commit.updatedProblems} skipped=${commit.skippedProblems}`
    );
    for (const warning of commit.warnings) {
      console.log(`  warn: ${warning}`);
    }
  }
  return 0;
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  const adapter = getContestAdapter(flags.contest);
  const manifestDir = flags.manifestDir ?? adapter.defaultManifestDir;
  const exitCode = await runImport(adapter, {
    manifestDir,
    uploaderEmail: flags.uploaderEmail,
    dryRun: flags.dryRun
  });

  await prisma.$disconnect();
  process.exit(exitCode);
}

const invokedFromCli = import.meta.url === `file://${process.argv[1]}`;
if (invokedFromCli) {
  main().catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
}

export { parseArgs, runImport, getContestAdapter };
