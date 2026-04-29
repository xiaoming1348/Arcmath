/**
 * Bulk-ingest AoPS contest archives into the DB.
 *
 * Two-phase pipeline:
 *   1. FETCH — for each (contest, year, exam) tuple, call the
 *      @arcmath/ingest-aops CLI to scrape AoPS Wiki into a JSON file
 *      under `--out-dir`.
 *   2. IMPORT — after fetches finish, feed the directory into the
 *      existing packages/db `runImportCli` which upserts sets + problems
 *      inside a transaction per file.
 *
 * Scope covered by the built-in manifest (`pnpm ... --default-manifest`):
 *   - AMC 8     : 2000–2025          (no exam suffix)
 *   - AMC 10A/B : 2002–2025          (A/B split started 2002)
 *   - AMC 12A/B : 2002–2025
 *   - AIME I/II : 2000–2025          (I since 2000, II since 2000 for most yrs)
 *
 * USAMO/USAJMO are olympiad-style proof contests that the current
 * fetch.ts does NOT yet scrape (it's AMC/AIME-centric). The built-in
 * manifest emits `needsManualUpload: true` stubs for those years so the
 * operator knows which sets still need a hand-curated teacher-v1 JSON.
 *
 * Resumable: by default, `--skip-existing` skips any JSON file that
 * already exists on disk, so re-running after a network failure just
 * fills the gaps.
 *
 * Usage:
 *   pnpm tsx scripts/bulk-ingest-aops.ts \
 *     --out-dir data/aops-bulk \
 *     --summary-out data/aops-bulk-summary.json
 *
 *   pnpm tsx scripts/bulk-ingest-aops.ts --dry-run
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { Contest } from "@arcmath/shared";

type ManifestEntry = {
  contest: Contest | "USAMO" | "USAJMO";
  year: number;
  exam: string | null;
  /** If true, we cannot scrape this automatically — emit a placeholder
   *  and let the operator upload a hand-curated teacher-v1 JSON. */
  needsManualUpload: boolean;
};

type FetchResult = {
  entry: ManifestEntry;
  outPath: string | null;
  status: "fetched" | "skipped-existing" | "manual-stub" | "fetch-failed";
  error?: string;
};

type BulkSummary = {
  startedAt: string;
  finishedAt: string;
  totalEntries: number;
  fetched: number;
  skippedExisting: number;
  manualStubs: number;
  fetchFailures: number;
  importSummary: {
    files: number;
    filesMatched: number;
    failedFiles: number;
    setsCreated: number;
    setsUpdated: number;
    problemsCreated: number;
    problemsUpdated: number;
    problemsSkipped: number;
  } | null;
  manualUploadsPending: Array<{
    contest: string;
    year: number;
    exam: string | null;
  }>;
  fetchFailuresDetail: Array<{
    contest: string;
    year: number;
    exam: string | null;
    error: string;
  }>;
};

type CliFlags = {
  outDir: string;
  summaryOut: string;
  manifestPath: string | null;
  skipExisting: boolean;
  skipImport: boolean;
  dryRun: boolean;
  delayMs: number;
  fetchConcurrency: number;
  yearFrom: number | null;
  yearTo: number | null;
  contests: string[] | null;
};

// ---------------------------------------------------------------- manifest

function buildDefaultManifest(yearFrom = 2000, yearTo = 2025): ManifestEntry[] {
  const manifest: ManifestEntry[] = [];

  // AMC 8 — annual since 1985 in reality, but our target window starts
  // at `yearFrom`. No exam code.
  for (let year = Math.max(2000, yearFrom); year <= yearTo; year++) {
    manifest.push({
      contest: "AMC8",
      year,
      exam: null,
      needsManualUpload: false
    });
  }

  // AMC 10 — A + B split started 2002. Before that it was a single paper.
  // We intentionally stop at 2002 to avoid scraping the pre-split format
  // which the fetch.ts contest-validator rejects.
  for (let year = Math.max(2002, yearFrom); year <= yearTo; year++) {
    manifest.push({ contest: "AMC10", year, exam: "A", needsManualUpload: false });
    manifest.push({ contest: "AMC10", year, exam: "B", needsManualUpload: false });
  }

  // AMC 12 — same A/B split start year.
  for (let year = Math.max(2002, yearFrom); year <= yearTo; year++) {
    manifest.push({ contest: "AMC12", year, exam: "A", needsManualUpload: false });
    manifest.push({ contest: "AMC12", year, exam: "B", needsManualUpload: false });
  }

  // AIME — I since 1983, II added 2000. Both run annually.
  for (let year = Math.max(2000, yearFrom); year <= yearTo; year++) {
    manifest.push({ contest: "AIME", year, exam: "I", needsManualUpload: false });
    manifest.push({ contest: "AIME", year, exam: "II", needsManualUpload: false });
  }

  // USAMO / USAJMO — proof olympiads. AoPS Wiki has them but our current
  // fetch.ts pipeline targets multiple-choice/integer contests only.
  // Emit manual-stub entries so the operator can hand off to the teacher
  // upload flow with a curated JSON (statements + solutionSketch per
  // problem). USAJMO didn't exist before 2010; we cap at 2015 per the
  // Phase 3 pilot scope.
  for (let year = Math.max(2015, yearFrom); year <= yearTo; year++) {
    manifest.push({ contest: "USAMO", year, exam: null, needsManualUpload: true });
    manifest.push({ contest: "USAJMO", year, exam: null, needsManualUpload: true });
  }

  return manifest;
}

function filterManifest(
  manifest: ManifestEntry[],
  flags: CliFlags
): ManifestEntry[] {
  return manifest.filter((entry) => {
    if (flags.yearFrom !== null && entry.year < flags.yearFrom) return false;
    if (flags.yearTo !== null && entry.year > flags.yearTo) return false;
    if (flags.contests && flags.contests.length > 0) {
      if (!flags.contests.includes(entry.contest)) return false;
    }
    return true;
  });
}

function fileNameFor(entry: ManifestEntry): string {
  const suffix = entry.exam ? `_${entry.exam.toLowerCase()}` : "";
  return `${entry.contest.toLowerCase()}_${entry.year}${suffix}.json`;
}

// ---------------------------------------------------------- file helpers

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

async function writeManualStub(outPath: string, entry: ManifestEntry): Promise<void> {
  const stub = {
    _stub: true,
    _note:
      "Proof-style contest — upload a hand-curated teacher-v1 JSON via the admin import panel. This stub is a placeholder so the bulk importer knows which sets still need content.",
    schemaVersion: "arcmath-problem-set-v1",
    contest: entry.contest,
    year: entry.year,
    exam: entry.exam,
    problems: []
  };
  await writeFile(outPath, JSON.stringify(stub, null, 2), "utf8");
}

// -------------------------------------------------------------- fetchers

/**
 * Shells out to `pnpm -F @arcmath/ingest-aops fetch` for one entry. We
 * prefer child-process execution over importing the CLI's `main()`
 * directly because the ingest-aops package has its own CWD assumptions
 * (it resolves `.cache` from process.cwd() and uses node:fetch against
 * real URLs), and spawning keeps any stray process.exit() contained.
 */
async function fetchOne(
  entry: ManifestEntry,
  outPath: string,
  flags: CliFlags
): Promise<FetchResult> {
  if (entry.needsManualUpload) {
    await writeManualStub(outPath, entry);
    return { entry, outPath, status: "manual-stub" };
  }

  const args = [
    "-F",
    "@arcmath/ingest-aops",
    "fetch",
    "--contest",
    entry.contest,
    "--year",
    String(entry.year),
    "--out",
    outPath,
    "--delay-ms",
    String(flags.delayMs)
  ];
  if (entry.exam) {
    args.push("--exam", entry.exam);
  }

  if (flags.dryRun) {
    console.log(`[dry-run] pnpm ${args.join(" ")}`);
    return { entry, outPath, status: "fetched" };
  }

  return new Promise<FetchResult>((resolve) => {
    const child = spawn("pnpm", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env }
    });
    let stderr = "";
    child.stderr.on("data", (buf: Buffer) => {
      stderr += buf.toString("utf8");
    });
    child.on("close", async (code) => {
      if (code === 0 && (await pathExists(outPath))) {
        resolve({ entry, outPath, status: "fetched" });
      } else {
        resolve({
          entry,
          outPath: null,
          status: "fetch-failed",
          error: stderr.trim() || `fetch exited with code ${code}`
        });
      }
    });
  });
}

/**
 * Sequentially drive fetches so we don't hammer AoPS. A small
 * concurrency (2-3) is tolerated by the server but we default to 1
 * here; higher values are available via --fetch-concurrency.
 */
async function runFetches(
  manifest: ManifestEntry[],
  flags: CliFlags
): Promise<FetchResult[]> {
  const results: FetchResult[] = [];
  const queue = [...manifest];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) break;
      const outPath = path.join(flags.outDir, fileNameFor(entry));
      if (flags.skipExisting && (await pathExists(outPath))) {
        results.push({ entry, outPath, status: "skipped-existing" });
        continue;
      }
      const result = await fetchOne(entry, outPath, flags);
      results.push(result);
      const tail =
        result.status === "fetched"
          ? "ok"
          : result.status === "manual-stub"
            ? "stub"
            : result.status === "skipped-existing"
              ? "skip"
              : `FAIL: ${result.error ?? ""}`;
      console.log(
        `[${results.length}/${manifest.length}] ${entry.contest} ${entry.year}${entry.exam ?? ""} — ${tail}`
      );
    }
  }

  const workers = Array.from({ length: Math.max(1, flags.fetchConcurrency) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------- import phase

async function runImportPhase(
  flags: CliFlags
): Promise<BulkSummary["importSummary"]> {
  if (flags.skipImport || flags.dryRun) return null;

  // Dynamic import so the script is still usable even when the DB
  // package isn't wired up yet (e.g., in a fresh clone before
  // `db:generate` runs).
  const { runImportCli } = await import("@arcmath/db/dist/aops/import-cli.js").catch(
    async () => import("../packages/db/src/aops/import-cli.ts")
  );

  const summary = await runImportCli({
    dir: flags.outDir,
    dryRun: false
  });

  return {
    files: summary.files,
    filesMatched: summary.filesMatched,
    failedFiles: summary.failedFiles,
    setsCreated: summary.setsCreated,
    setsUpdated: summary.setsUpdated,
    problemsCreated: summary.problemsCreated,
    problemsUpdated: summary.problemsUpdated,
    problemsSkipped: summary.problemsSkipped
  };
}

// --------------------------------------------------------------- argv parsing

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    outDir: path.resolve(process.cwd(), "data/aops-bulk"),
    summaryOut: path.resolve(process.cwd(), "data/aops-bulk-summary.json"),
    manifestPath: null,
    skipExisting: true,
    skipImport: false,
    dryRun: false,
    delayMs: 400,
    fetchConcurrency: 1,
    yearFrom: null,
    yearTo: null,
    contests: null
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--out-dir":
        flags.outDir = path.resolve(process.cwd(), next ?? flags.outDir);
        i++;
        break;
      case "--summary-out":
        flags.summaryOut = path.resolve(process.cwd(), next ?? flags.summaryOut);
        i++;
        break;
      case "--manifest":
        flags.manifestPath = path.resolve(process.cwd(), next ?? "");
        i++;
        break;
      case "--no-skip-existing":
        flags.skipExisting = false;
        break;
      case "--skip-import":
        flags.skipImport = true;
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "--delay-ms":
        flags.delayMs = Number(next ?? flags.delayMs);
        i++;
        break;
      case "--fetch-concurrency":
        flags.fetchConcurrency = Number(next ?? flags.fetchConcurrency);
        i++;
        break;
      case "--year-from":
        flags.yearFrom = Number(next ?? 0);
        i++;
        break;
      case "--year-to":
        flags.yearTo = Number(next ?? 0);
        i++;
        break;
      case "--contest":
        flags.contests = (flags.contests ?? []).concat(
          (next ?? "").split(",").filter(Boolean)
        );
        i++;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  return flags;
}

function printHelp(): void {
  console.log(`Bulk AoPS ingestion

Usage:
  pnpm tsx scripts/bulk-ingest-aops.ts [flags]

Flags:
  --out-dir <path>         Directory for per-set JSON files (default: data/aops-bulk)
  --summary-out <path>     JSON summary output (default: data/aops-bulk-summary.json)
  --manifest <path>        Use a custom manifest JSON instead of the built-in
  --no-skip-existing       Re-fetch even if a JSON for this entry already exists
  --skip-import            Fetch only; don't hit the DB
  --dry-run                Print what would happen, touch no files
  --delay-ms <n>           Inter-request delay for ingest-aops (default 400)
  --fetch-concurrency <n>  Parallel fetches (default 1; AoPS-friendly)
  --year-from <n>          Restrict manifest to year >= n
  --year-to <n>            Restrict manifest to year <= n
  --contest <list>         csv of contest names (AMC8,AMC10,...)

Examples:
  pnpm tsx scripts/bulk-ingest-aops.ts --year-from 2020 --year-to 2025
  pnpm tsx scripts/bulk-ingest-aops.ts --contest AMC10,AMC12 --fetch-concurrency 2
`);
}

async function loadCustomManifest(manifestPath: string): Promise<ManifestEntry[]> {
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Manifest must be a JSON array of entries");
  }
  return parsed.map((row) => {
    if (!row.contest || typeof row.year !== "number") {
      throw new Error(`Invalid manifest entry: ${JSON.stringify(row)}`);
    }
    return {
      contest: row.contest,
      year: row.year,
      exam: row.exam ?? null,
      needsManualUpload: Boolean(row.needsManualUpload)
    };
  });
}

// -------------------------------------------------------------- main

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  await mkdir(flags.outDir, { recursive: true });
  await mkdir(path.dirname(flags.summaryOut), { recursive: true });

  const manifest = flags.manifestPath
    ? await loadCustomManifest(flags.manifestPath)
    : buildDefaultManifest();
  const filtered = filterManifest(manifest, flags);

  console.log(
    `Bulk ingest plan: ${filtered.length} entries (from ${manifest.length} total; year filter: ${flags.yearFrom ?? "-"}..${flags.yearTo ?? "-"})`
  );
  if (flags.dryRun) {
    for (const entry of filtered) {
      console.log(`  ${entry.contest} ${entry.year}${entry.exam ?? ""}${entry.needsManualUpload ? " (manual)" : ""}`);
    }
  }

  const startedAt = new Date().toISOString();
  const fetchResults = await runFetches(filtered, flags);

  const fetched = fetchResults.filter((r) => r.status === "fetched").length;
  const skippedExisting = fetchResults.filter((r) => r.status === "skipped-existing").length;
  const manualStubs = fetchResults.filter((r) => r.status === "manual-stub").length;
  const fetchFailures = fetchResults.filter((r) => r.status === "fetch-failed");

  console.log(
    `Fetch phase done: fetched=${fetched}, skipped-existing=${skippedExisting}, stubs=${manualStubs}, failures=${fetchFailures.length}`
  );

  const importSummary = await runImportPhase(flags);
  const finishedAt = new Date().toISOString();

  const summary: BulkSummary = {
    startedAt,
    finishedAt,
    totalEntries: filtered.length,
    fetched,
    skippedExisting,
    manualStubs,
    fetchFailures: fetchFailures.length,
    importSummary,
    manualUploadsPending: fetchResults
      .filter((r) => r.status === "manual-stub")
      .map((r) => ({
        contest: r.entry.contest,
        year: r.entry.year,
        exam: r.entry.exam
      })),
    fetchFailuresDetail: fetchFailures.map((r) => ({
      contest: r.entry.contest,
      year: r.entry.year,
      exam: r.entry.exam,
      error: r.error ?? "unknown"
    }))
  };

  await writeFile(flags.summaryOut, JSON.stringify(summary, null, 2), "utf8");
  console.log(`Wrote summary to ${flags.summaryOut}`);

  if (importSummary) {
    console.log(
      `Import phase: setsCreated=${importSummary.setsCreated}, setsUpdated=${importSummary.setsUpdated}, problemsCreated=${importSummary.problemsCreated}, problemsUpdated=${importSummary.problemsUpdated}`
    );
  }
  if (fetchFailures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("bulk-ingest-aops failed:", err);
  process.exitCode = 1;
});
