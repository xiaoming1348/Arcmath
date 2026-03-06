import path from "node:path";
import { fetchAoPSContestImports, parseFetchArgs } from "./fetch";

function printUsage() {
  console.log("AoPS Contest Fetch Tool");
  console.log("");
  console.log("Usage:");
  console.log("  pnpm -C packages/db aops:fetch [options]");
  console.log("");
  console.log("Options:");
  console.log("  --output <dir>        Output directory for generated JSON files");
  console.log("  --source <mode>       auto | community | wiki (default: auto)");
  console.log("  --pages <n>           Number of contest category pages to scan (default: 1)");
  console.log("  --all                 Crawl category pages until exhausted (or max-pages)");
  console.log("  --max-pages <n>       Safety cap when using --all (default: 80)");
  console.log("  --limit <n>           Max topics to fetch (default: 10)");
  console.log("  --include <csv>       Contests filter, e.g. AMC8,AMC10,AMC12,AIME");
  console.log("  --include-statements  Fetch per-problem wiki statement text (default: on)");
  console.log("  --topic-ids <csv>     Specific AoPS topic ids, e.g. 12345,67890");
  console.log("  --delay-ms <n>        Delay between requests (default: 250)");
  console.log("  --dry-run             Discover only, do not fetch/write");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const options = parseFetchArgs(args);
  const summary = await fetchAoPSContestImports(options);

  console.log("AoPS Fetch Summary");
  console.log(`  discovered: ${summary.discovered}`);
  console.log(`  attempted: ${summary.attempted}`);
  console.log(`  written: ${summary.written}`);
  console.log(`  failed: ${summary.failed}`);
  console.log(`  skipped: ${summary.skipped}`);
  console.log(`  output dir: ${path.resolve(options.outputDir)}`);

  if (summary.outputs.length > 0) {
    console.log("");
    console.log("Written files:");
    for (const filePath of summary.outputs) {
      console.log(`  - ${filePath}`);
    }
  }

  if (summary.errors.length > 0) {
    console.log("");
    console.log("Errors:");
    for (const error of summary.errors) {
      console.log(`  - ${error}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("aops:fetch failed", error);
  process.exitCode = 1;
});
