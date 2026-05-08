#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { USAMO_MANIFEST_DIR, loadAllUsamoManifests } from "./load-manifest";

type CliCommand = "validate-manifests" | "build-payloads";

type BuildPayloadsFlags = {
  outDir: string;
  manifestDir: string;
};

type ValidateFlags = {
  manifestDir: string;
};

function parseArgs(argv: string[]): { command: CliCommand; flags: BuildPayloadsFlags | ValidateFlags } {
  const [command, ...rest] = argv;
  if (command !== "validate-manifests" && command !== "build-payloads") {
    throw new Error(
      `Unknown command: ${command ?? "<none>"}. Expected "validate-manifests" or "build-payloads".`
    );
  }

  let manifestDir = USAMO_MANIFEST_DIR;
  let outDir = path.resolve(process.cwd(), "out/usamo-payloads");

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (flag === "--manifest-dir" && value) {
      manifestDir = path.resolve(value);
      index += 1;
    } else if (flag === "--out-dir" && value) {
      outDir = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }

  if (command === "build-payloads") {
    return { command, flags: { outDir, manifestDir } };
  }
  return { command, flags: { manifestDir } };
}

async function runValidate(flags: ValidateFlags): Promise<number> {
  const results = await loadAllUsamoManifests({ manifestDir: flags.manifestDir });
  let failed = 0;
  for (const result of results) {
    const label = path.basename(result.manifestPath);
    if (result.ok) {
      console.log(`ok  ${label}  USAMO ${result.data.problemSet.year} (${result.data.problems.length} problems)`);
    } else {
      failed += 1;
      console.error(`fail ${label}`);
      for (const error of result.errors) {
        console.error(`     - ${error}`);
      }
    }
  }
  if (failed === 0) {
    console.log(`\n${results.length} manifest${results.length === 1 ? "" : "s"} validated.`);
  } else {
    console.error(`\n${failed} manifest${failed === 1 ? "" : "s"} failed validation.`);
  }
  return failed === 0 ? 0 : 1;
}

async function runBuildPayloads(flags: BuildPayloadsFlags): Promise<number> {
  const results = await loadAllUsamoManifests({ manifestDir: flags.manifestDir });
  const failures = results.filter((entry) => !entry.ok);
  if (failures.length > 0) {
    console.error(
      `Refusing to build payloads — ${failures.length} manifest(s) invalid. Run validate-manifests to inspect.`
    );
    return 1;
  }
  await mkdir(flags.outDir, { recursive: true });
  for (const result of results) {
    if (!result.ok) continue;
    const outName = `${result.data.problemSet.contest.toLowerCase()}-${result.data.problemSet.year}.json`;
    const outPath = path.resolve(flags.outDir, outName);
    await writeFile(outPath, `${JSON.stringify(result.data, null, 2)}\n`, "utf8");
    console.log(`wrote ${outPath}`);
  }
  return 0;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const exitCode =
    parsed.command === "validate-manifests"
      ? await runValidate(parsed.flags as ValidateFlags)
      : await runBuildPayloads(parsed.flags as BuildPayloadsFlags);
  process.exit(exitCode);
}

const invokedFromCli = import.meta.url === `file://${process.argv[1]}`;
if (invokedFromCli) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  });
}
