import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importProblemSetSchema, type ImportProblemSetInput } from "@arcmath/shared";

/**
 * Absolute path to the directory containing USAMO manifest files.
 * Manifests are organised as `usamo-<year>.json` (one paper per
 * year, no exam variant).
 */
export const USAMO_MANIFEST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "manifests"
);

export type UsamoManifestLoadResult =
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
 * Load and validate a single USAMO year manifest.
 *
 * The manifest must:
 *  - be valid JSON
 *  - conform to `importProblemSetSchema` (from @arcmath/shared) —
 *    which in particular enforces the 6-problem rule and forbids
 *    an exam variant for USAMO
 *  - set `problemSet.contest === "USAMO"` (belt-and-braces here)
 */
export async function loadUsamoManifest(manifestPath: string): Promise<UsamoManifestLoadResult> {
  const absolutePath = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.resolve(USAMO_MANIFEST_DIR, manifestPath);

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

  if (parsed.data.problemSet.contest !== "USAMO") {
    return {
      ok: false,
      manifestPath: absolutePath,
      errors: [
        `Expected problemSet.contest to be "USAMO", got ${JSON.stringify(parsed.data.problemSet.contest)}.`
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
 * Discover and load every USAMO manifest in `USAMO_MANIFEST_DIR`.
 * Returns results in filename order so snapshot diffs stay stable.
 */
export async function loadAllUsamoManifests(
  options: { manifestDir?: string } = {}
): Promise<UsamoManifestLoadResult[]> {
  const manifestDir = options.manifestDir ?? USAMO_MANIFEST_DIR;
  const entries = await readdir(manifestDir);
  const manifestFiles = entries.filter((entry) => entry.endsWith(".json")).sort();

  const results: UsamoManifestLoadResult[] = [];
  for (const fileName of manifestFiles) {
    const result = await loadUsamoManifest(path.resolve(manifestDir, fileName));
    results.push(result);
  }
  return results;
}
