import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importProblemSetSchema, type ImportProblemSetInput } from "@arcmath/shared";

/**
 * Absolute path to the directory containing Euclid manifest files.
 * Manifests are organised as `euclid-<year>.json` (one paper per year,
 * no exam variant — CEMC publishes a single Euclid each April).
 */
export const EUCLID_MANIFEST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "manifests"
);

export type EuclidManifestLoadResult =
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
 * Load and validate a single Euclid year manifest.
 *
 * The manifest must:
 *  - be valid JSON
 *  - conform to `importProblemSetSchema` (from @arcmath/shared)
 *  - set `problemSet.contest === "EUCLID"`
 *
 * Callers get a discriminated-union result — either `ok: true` with the
 * parsed `ImportProblemSetInput`, or `ok: false` with a flat list of
 * human-readable validation errors. We never throw for "expected"
 * validation failures; we only throw on IO errors (missing file,
 * permission denied).
 */
export async function loadEuclidManifest(manifestPath: string): Promise<EuclidManifestLoadResult> {
  const absolutePath = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.resolve(EUCLID_MANIFEST_DIR, manifestPath);

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

  if (parsed.data.problemSet.contest !== "EUCLID") {
    return {
      ok: false,
      manifestPath: absolutePath,
      errors: [
        `Expected problemSet.contest to be "EUCLID", got ${JSON.stringify(parsed.data.problemSet.contest)}.`
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
 * Discover and load every Euclid manifest in `EUCLID_MANIFEST_DIR`.
 * Returns results in filename order so snapshot diffs stay stable.
 */
export async function loadAllEuclidManifests(
  options: { manifestDir?: string } = {}
): Promise<EuclidManifestLoadResult[]> {
  const manifestDir = options.manifestDir ?? EUCLID_MANIFEST_DIR;
  const entries = await readdir(manifestDir);
  const manifestFiles = entries.filter((entry) => entry.endsWith(".json")).sort();

  const results: EuclidManifestLoadResult[] = [];
  for (const fileName of manifestFiles) {
    const result = await loadEuclidManifest(path.resolve(manifestDir, fileName));
    results.push(result);
  }
  return results;
}
