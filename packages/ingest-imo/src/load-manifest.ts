import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importProblemSetSchema, type ImportProblemSetInput } from "@arcmath/shared";

/**
 * Absolute path to the directory containing IMO manifest files.
 * Manifests are organised as `imo-<year>.json` (one paper per year,
 * no exam variant — IMO has the same 6-problem, 2-day structure as
 * USAMO).
 */
export const IMO_MANIFEST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "manifests"
);

export type ImoManifestLoadResult =
  | {
      ok: true;
      manifestPath: string;
      data: ImportProblemSetInput;
    }
  | {
      ok: false;
      manifestPath: string;
      errors: string[];
    };

function formatZodIssues(issues: Array<{ path: Array<string | number>; message: string }>): string[] {
  return issues.map((issue) => {
    const joinedPath = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${joinedPath}: ${issue.message}`;
  });
}

/**
 * Load and validate a single IMO year manifest.
 *
 * The manifest must:
 *  - be valid JSON
 *  - conform to `importProblemSetSchema` (from @arcmath/shared) —
 *    which enforces the 6-problem rule and forbids an exam variant
 *    for IMO
 *  - set `problemSet.contest === "IMO"` (belt-and-braces here)
 *
 * IMO is the apex of the secondary-school olympiad ladder: 6 problems
 * over 2 days (3/day, 4.5h each), all proof-based. Difficulty ranges
 * from "manageable for any olympiad student" (P1, P4) to "hardest
 * problems on Earth that aren't research-level" (P3, P6). For Arcmath
 * this content sits above USAMO as the "if you're a USAMO qualifier
 * and want to keep growing" tier.
 */
export async function loadImoManifest(manifestPath: string): Promise<ImoManifestLoadResult> {
  const absolutePath = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.resolve(IMO_MANIFEST_DIR, manifestPath);

  const rawText = await readFile(absolutePath, "utf8");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch (error) {
    return {
      ok: false,
      manifestPath: absolutePath,
      errors: [`Invalid JSON in ${absolutePath}: ${(error as Error).message}`]
    };
  }

  const parsed = importProblemSetSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      manifestPath: absolutePath,
      errors: formatZodIssues(parsed.error.issues)
    };
  }

  if (parsed.data.problemSet.contest !== "IMO") {
    return {
      ok: false,
      manifestPath: absolutePath,
      errors: [
        `Expected problemSet.contest to be "IMO", got ${JSON.stringify(parsed.data.problemSet.contest)}.`
      ]
    };
  }

  return {
    ok: true,
    manifestPath: absolutePath,
    data: parsed.data
  };
}

/**
 * Discover and load every IMO manifest in `IMO_MANIFEST_DIR`.
 * Returns results in filename order so snapshot diffs stay stable.
 */
export async function loadAllImoManifests(
  options: { manifestDir?: string } = {}
): Promise<ImoManifestLoadResult[]> {
  const manifestDir = options.manifestDir ?? IMO_MANIFEST_DIR;
  const entries = await readdir(manifestDir);
  const manifestFiles = entries.filter((entry) => entry.endsWith(".json")).sort();

  const results: ImoManifestLoadResult[] = [];
  for (const fileName of manifestFiles) {
    const result = await loadImoManifest(path.resolve(manifestDir, fileName));
    results.push(result);
  }
  return results;
}
