import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportProblemSetInput } from "../packages/shared/src/import-schema";
import {
  applyRealImportQuality,
  auditRealImportPayload,
  getRealImportQualityFileSetKey
} from "./real-import-quality";

type Args = {
  filePaths: string[];
};

function printUsage(): void {
  console.log("Refresh canonical real-import JSON files through the shared quality pass.");
  console.log("");
  console.log("Usage:");
  console.log("  node --import tsx scripts/refresh-real-import-quality.ts --file <path> [--file <path> ...]");
}

function parseArgs(argv: string[]): Args {
  const filePaths: string[] = [];

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

    if (arg === "--file") {
      if (!next) {
        throw new Error("Missing value for --file");
      }
      filePaths.push(path.resolve(process.cwd(), next));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (filePaths.length === 0) {
    throw new Error("At least one --file is required");
  }

  return { filePaths };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  for (const filePath of args.filePaths) {
    const raw = await readFile(filePath, "utf8");
    const payload = JSON.parse(raw) as ImportProblemSetInput;
    const setKey = getRealImportQualityFileSetKey(filePath);
    const nextPayload = applyRealImportQuality(payload, setKey);
    const summary = auditRealImportPayload(nextPayload, setKey);
    await writeFile(filePath, JSON.stringify(nextPayload, null, 2) + "\n", "utf8");
    console.log(
      `${path.basename(filePath)}: topic=${summary.topicKeyCount}/${summary.problemCount}, difficulty=${summary.difficultyBandCount}/${summary.problemCount}, suspiciousChoices=${summary.suspiciousChoiceProblems.length}, likelyFigureRefs=${summary.likelyFigureDependentProblems.length}`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exitCode = 1;
});
