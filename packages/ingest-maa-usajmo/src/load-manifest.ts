import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importProblemSetSchema, type ImportProblemSetInput } from "@arcmath/shared";

/**
 * Absolute path to the directory containing USAJMO manifest files.
 * Manifests are organised as `usajmo-<year>.json` (one paper per year,
 * no exam variant — USAJMO has the same 6-problem, 2-day structure as
 * USAMO).
 */
export const USAJMO_MANIFEST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "manifests"
);

export type UsajmoManifestLoadResult =
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
 * Load and validate a single USAJMO year manifest.
 *
 * The manifest must:
 *  - be valid JSON
 *  - conform to `importProblemSetSchema` (from @arcmath/shared) —
 *    which in particular enforces the 6-problem rule and forbids
 *    an exam variant for USAJMO
 *  - set `problemSet.contest === "USAJMO"` (belt-and-braces here)
 *
 * USAJMO is the *junior* sibling of USAMO: same 6-problem, 2-day,
 * proof-based structure, but targeted at strong AMC10/AIME-level
 * students rather than the IMO-track elite. For Arcmath, USAJMO sits
 * in the admissions-track "stretch" tier — every problem is HARD by
 * AMC standards but somewhat more approachable than USAMO.
 */
export async function loadUsajmoManifest(manifestPath: string): Promise<UsajmoManifestLoadResult> {
  const absolutePath = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.resolve(USAJMO_MANIFEST_DIR, manifestPath);

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

  if (parsed.data.problemSet.contest !== "USAJMO") {
    return {
      ok: false,
      manifestPath: absolutePath,
      errors: [
        `Expected problemSet.contest to be "USAJMO", got ${JSON.stringify(parsed.data.problemSet.contest)}.`
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
 * Discover and load every USAJMO manifest in `USAJMO_MANIFEST_DIR`.
 * Returns results in filename order so snapshot diffs stay stable.
 */
export async function loadAllUsajmoManifests(
  options: { manifestDir?: string } = {}
): Promise<UsajmoManifestLoadResult[]> {
  const manifestDir = options.manifestDir ?? USAJMO_MANIFEST_DIR;
  const entries = await readdir(manifestDir);
  const manifestFiles = entries.filter((entry) => entry.endsWith(".json")).sort();

  const results: UsajmoManifestLoadResult[] = [];
  for (const fileName of manifestFiles) {
    const result = await loadUsajmoManifest(path.resolve(manifestDir, fileName));
    results.push(result);
  }
  return results;
}
