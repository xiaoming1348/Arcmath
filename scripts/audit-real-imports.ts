import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ImportProblemSetInput } from "../packages/shared/src/import-schema";
import { auditRealImportPayload } from "./real-import-quality";

async function main(): Promise<void> {
  const dir = path.resolve(process.cwd(), "packages/db/data/real-imports");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();

  for (const file of files) {
    const raw = await readFile(path.join(dir, file), "utf8");
    const payload = JSON.parse(raw) as ImportProblemSetInput;
    const summary = auditRealImportPayload(payload, path.basename(file, ".json"));
    console.log(JSON.stringify(summary));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
