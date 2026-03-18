import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../packages/db/src/client";
import { buildImportPreview, commitImportFromJson } from "../apps/web/src/lib/imports/contest-import";

type Command = "preview" | "commit";

type Args = {
  command: Command;
  filePath: string;
  uploadedByEmail?: string;
};

function printUsage(): void {
  console.log("Run the existing real-import preview/commit flow against a canonical JSON file.");
  console.log("");
  console.log("Usage:");
  console.log(
    "  node --import tsx scripts/run-real-import.ts <preview|commit> --file <path> [--uploaded-by-email <email>]"
  );
}

function parseArgs(argv: string[]): Args {
  const command = argv[0];
  if (command !== "preview" && command !== "commit") {
    throw new Error("First argument must be preview or commit");
  }

  let filePath: string | undefined;
  let uploadedByEmail: string | undefined;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--file") {
      if (!next) {
        throw new Error("Missing value for --file");
      }
      filePath = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--uploaded-by-email") {
      if (!next) {
        throw new Error("Missing value for --uploaded-by-email");
      }
      uploadedByEmail = next.trim().toLowerCase();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!filePath) {
    throw new Error("--file is required");
  }

  return {
    command,
    filePath,
    uploadedByEmail
  };
}

async function resolveUploadedByUserId(email?: string): Promise<string> {
  const targetEmail = email ?? "admin@arcmath.local";
  const user = await prisma.user.findUnique({
    where: { email: targetEmail },
    select: { id: true }
  });

  if (!user) {
    throw new Error(`Could not find uploader user: ${targetEmail}`);
  }

  return user.id;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const jsonText = await readFile(args.filePath, "utf8");

  if (args.command === "preview") {
    const result = await buildImportPreview(prisma, jsonText);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const uploadedByUserId = await resolveUploadedByUserId(args.uploadedByEmail);
  const result = await commitImportFromJson({
    prisma,
    jsonText,
    filename: path.basename(args.filePath),
    uploadedByUserId
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
