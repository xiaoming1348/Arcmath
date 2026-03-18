import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type ImportProblemSetInput
} from "../packages/shared/src/import-schema";
import { applyRealImportQuality, getRealImportQualityFileSetKey } from "./real-import-quality";

type BuildOptions = {
  aopsJsonPath: string;
  outPath: string;
  verifiedPdfUrl?: string;
};

function normalizeIntegerAnswer(answer: string): string {
  const trimmed = answer.trim();
  const sign = trimmed.startsWith("-") ? "-" : "";
  const digits = sign ? trimmed.slice(1) : trimmed;
  const normalizedDigits = digits.replace(/^0+(?=\d)/u, "");
  return `${sign}${normalizedDigits}`;
}

function printUsage(): void {
  console.log("Build canonical INTEGER real-import JSON directly from AoPS JSON");
  console.log("");
  console.log("Usage:");
  console.log(
    "  node --import tsx scripts/build-integer-real-import.ts --aops-json <path> --out <path> [--verified-pdf-url <url>]"
  );
}

function parseArgs(argv: string[]): BuildOptions {
  let aopsJsonPath: string | undefined;
  let outPath: string | undefined;
  let verifiedPdfUrl: string | undefined;

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

    if (arg === "--aops-json") {
      if (!next) {
        throw new Error("Missing value for --aops-json");
      }
      aopsJsonPath = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--out") {
      if (!next) {
        throw new Error("Missing value for --out");
      }
      outPath = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--verified-pdf-url") {
      if (!next) {
        throw new Error("Missing value for --verified-pdf-url");
      }
      verifiedPdfUrl = next.trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!aopsJsonPath || !outPath) {
    throw new Error("--aops-json and --out are required");
  }

  return {
    aopsJsonPath,
    outPath,
    verifiedPdfUrl
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const aopsRaw = await readFile(options.aopsJsonPath, "utf8");
  const basePayload = JSON.parse(aopsRaw) as ImportProblemSetInput;
  const setKey = getRealImportQualityFileSetKey(options.aopsJsonPath);

  const rawPayload: ImportProblemSetInput = {
    problemSet: {
      ...basePayload.problemSet,
      ...(options.verifiedPdfUrl ? { verifiedPdfUrl: options.verifiedPdfUrl } : {})
    },
    problems: basePayload.problems.map((problem) => ({
      ...problem,
      answer: normalizeIntegerAnswer(problem.answer)
    }))
  };

  const validated = applyRealImportQuality(rawPayload, setKey);

  await mkdir(path.dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, JSON.stringify(validated, null, 2) + "\n", "utf8");

  console.log(`Wrote ${options.outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exitCode = 1;
});
