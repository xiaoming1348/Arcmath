import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importProblemSetSchema, type ImportProblemSetInput } from "@arcmath/shared";

/**
 * Absolute path to the directory containing STEP manifest files.
 * Manifests are organised as `step-<year>-<variant>.json` where
 * variant is `I`, `II`, or `III` (one per paper variant per year).
 */
export const STEP_MANIFEST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "manifests"
);

export type StepManifestLoadResult =
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
 * Load and validate a single STEP paper manifest.
 *
 * The manifest must:
 *  - be valid JSON
 *  - conform to `importProblemSetSchema` (from @arcmath/shared)
 *  - set `problemSet.contest === "STEP"`
 *  - set `problemSet.exam` to one of `"I"`, `"II"`, `"III"`
 *    (enforced by the shared schema's superRefine — we re-check the
 *     contest-field here as a belt-and-braces guard against misfiled
 *     manifests landing in this loader)
 *
 * Callers get a discriminated-union result — either `ok: true` with
 * the parsed `ImportProblemSetInput`, or `ok: false` with a flat
 * list of human-readable validation errors.
 */
export async function loadStepManifest(manifestPath: string): Promise<StepManifestLoadResult> {
  const absolutePath = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.resolve(STEP_MANIFEST_DIR, manifestPath);

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

  if (parsed.data.problemSet.contest !== "STEP") {
    return {
      ok: false,
      manifestPath: absolutePath,
      errors: [
        `Expected problemSet.contest to be "STEP", got ${JSON.stringify(parsed.data.problemSet.contest)}.`
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
 * Discover and load every STEP manifest in `STEP_MANIFEST_DIR`.
 * Returns results in filename order so snapshot diffs stay stable.
 */
export async function loadAllStepManifests(
  options: { manifestDir?: string } = {}
): Promise<StepManifestLoadResult[]> {
  const manifestDir = options.manifestDir ?? STEP_MANIFEST_DIR;
  const entries = await readdir(manifestDir);
  const manifestFiles = entries.filter((entry) => entry.endsWith(".json")).sort();

  const results: StepManifestLoadResult[] = [];
  for (const fileName of manifestFiles) {
    const result = await loadStepManifest(path.resolve(manifestDir, fileName));
    results.push(result);
  }
  return results;
}
