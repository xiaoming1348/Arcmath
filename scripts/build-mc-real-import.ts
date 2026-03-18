import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import {
  type ImportProblemSetInput
} from "../packages/shared/src/import-schema";
import { applyRealImportQuality, getRealImportQualityFileSetKey } from "./real-import-quality";

const execFile = promisify(execFileCallback);

type BuildOptions = {
  aopsJsonPath: string;
  problemsPdfPath: string;
  outPath: string;
  verifiedPdfUrl?: string;
};

function printUsage(): void {
  console.log("Build canonical MC real-import JSON from AoPS JSON + searchable problems PDF");
  console.log("");
  console.log("Usage:");
  console.log(
    "  node --import tsx scripts/build-mc-real-import.ts --aops-json <path> --problems-pdf <path> --out <path> [--verified-pdf-url <url>]"
  );
}

function parseArgs(argv: string[]): BuildOptions {
  let aopsJsonPath: string | undefined;
  let problemsPdfPath: string | undefined;
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

    if (arg === "--problems-pdf") {
      if (!next) {
        throw new Error("Missing value for --problems-pdf");
      }
      problemsPdfPath = path.resolve(process.cwd(), next);
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

  if (!aopsJsonPath || !problemsPdfPath || !outPath) {
    throw new Error("--aops-json, --problems-pdf, and --out are required");
  }

  return {
    aopsJsonPath,
    problemsPdfPath,
    outPath,
    verifiedPdfUrl
  };
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const { stdout } = await execFile(
    "gs",
    ["-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=txtwrite", "-sOutputFile=-", pdfPath],
    { maxBuffer: 32 * 1024 * 1024 }
  );

  return stdout;
}

function cleanEmbeddedChoices(statement: string): string {
  return statement
    .replace(/\s*\$?\\textbf\{\(A\)\s*\}[\s\S]*$/u, "")
    .trim();
}

function extractChoiceMapFromPdfText(text: string): Map<number, string[]> {
  const lines = text.replace(/\f/g, "\n").split("\n");
  const blocks = new Map<number, string[]>();
  let currentProblem: number | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const problemMatch = /^Problem\s+(\d+)$/u.exec(line);

    if (problemMatch) {
      currentProblem = Number(problemMatch[1]);
      if (!blocks.has(currentProblem)) {
        blocks.set(currentProblem, []);
      }
      continue;
    }

    if (currentProblem === null) {
      continue;
    }

    if (/^Page\s+\d+\s+of\s+\d+$/iu.test(line)) {
      continue;
    }

    blocks.get(currentProblem)?.push(line);
  }

  const choiceMap = new Map<number, string[]>();

  for (const [problemNumber, blockLines] of blocks.entries()) {
    const choices: string[] = [];
    let currentChoiceIndex = -1;

    for (const line of blockLines) {
      const optionMatch = /^([A-E])\.\s*(.+)$/u.exec(line);
      if (optionMatch) {
        choices.push(optionMatch[2].trim());
        currentChoiceIndex = choices.length - 1;
        continue;
      }

      if (currentChoiceIndex >= 0) {
        if (!line || /^Problem\s+\d+$/u.test(line) || /^Page\s+\d+\s+of\s+\d+$/iu.test(line)) {
          continue;
        }

        if (/^\d+\s+(?:Problem|Solution|Solutions|See Also)\b/u.test(line)) {
          continue;
        }

        if (/^[A-E]\.\s*/u.test(line)) {
          continue;
        }

        choices[currentChoiceIndex] = `${choices[currentChoiceIndex]} ${line}`.replace(/\s+/gu, " ").trim();
      }
    }

    if (choices.length > 0) {
      choiceMap.set(problemNumber, choices);
    }
  }

  return choiceMap;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const aopsRaw = await readFile(options.aopsJsonPath, "utf8");
  const basePayload = JSON.parse(aopsRaw) as ImportProblemSetInput;
  const pdfText = await extractPdfText(options.problemsPdfPath);
  const choiceMap = extractChoiceMapFromPdfText(pdfText);
  const setKey = getRealImportQualityFileSetKey(options.aopsJsonPath);

  const rawPayload: ImportProblemSetInput = {
    problemSet: {
      ...basePayload.problemSet,
      ...(options.verifiedPdfUrl ? { verifiedPdfUrl: options.verifiedPdfUrl } : {})
    },
    problems: basePayload.problems.map((problem) => {
      if (problem.answerFormat !== "MULTIPLE_CHOICE") {
        return {
          ...problem,
          statement: cleanEmbeddedChoices(problem.statement)
        };
      }

      return {
        ...problem,
        statement: cleanEmbeddedChoices(problem.statement),
        choices: choiceMap.get(problem.number)
      };
    })
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
