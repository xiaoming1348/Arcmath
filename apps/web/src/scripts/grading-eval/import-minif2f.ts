/**
 * Pull the miniF2F-lean4 benchmark (yangky11/miniF2F-lean4) into our
 * grading-eval fixture format.
 *
 * Run this on a host with `git` + internet (Mac dev box or CI). The
 * Claude sandbox cannot reach GitHub directly. Outputs:
 *   apps/web/src/scripts/grading-eval/fixtures/minif2f.json
 *
 * Each miniF2F theorem becomes one fixture with:
 *   - problemStatement: prose paraphrase (from the leading comment if any,
 *     otherwise the Lean signature decoded into plain text)
 *   - rubric: 1 milestone with `formal.code` = the Lean statement, so the
 *     v2 Lean backend can be asked "does this proof discharge the
 *     theorem?"
 *   - studentSolutions: one CLEAN_CORRECT solution containing the
 *     reference Lean proof (when one exists; otherwise marked ESCALATE
 *     so the harness flags that the dataset itself lacks a proof for
 *     this entry).
 *
 * Usage (from the worktree root):
 *
 *   pnpm -C apps/web exec tsx \
 *     src/scripts/grading-eval/import-minif2f.ts \
 *     --output src/scripts/grading-eval/fixtures/minif2f.json
 *
 *   pnpm -C apps/web exec tsx \
 *     src/scripts/grading-eval/import-minif2f.ts \
 *     --source /tmp/miniF2F-lean4    # already cloned
 *
 * The parsed format is intentionally simple so we can swap in
 * OlympiadBench / PutnamBench later.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import {
  parseMiniF2FFile,
  type MiniF2FEntry,
  miniF2FEntriesToFixtures
} from "./minif2f-parser";

type Args = {
  source?: string;
  output: string;
  split: "test" | "valid" | "both";
  limit?: number;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    output: "src/scripts/grading-eval/fixtures/minif2f.json",
    split: "both"
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--source") out.source = argv[++i];
    else if (a === "--output") out.output = argv[++i];
    else if (a === "--split") {
      const v = argv[++i];
      if (v !== "test" && v !== "valid" && v !== "both") {
        throw new Error(`--split must be test|valid|both (got ${v})`);
      }
      out.split = v;
    } else if (a === "--limit") out.limit = Number(argv[++i]);
  }
  return out;
}

async function ensureSource(source?: string): Promise<string> {
  if (source && existsSync(source)) return source;
  const tmp = "/tmp/miniF2F-lean4";
  if (!existsSync(tmp)) {
    console.log("cloning yangky11/miniF2F-lean4 → /tmp/miniF2F-lean4");
    execSync(
      "git clone --depth 1 https://github.com/yangky11/miniF2F-lean4.git /tmp/miniF2F-lean4",
      { stdio: "inherit" }
    );
  }
  return tmp;
}

async function readSplitDir(
  src: string,
  splitName: "Test" | "Valid"
): Promise<MiniF2FEntry[]> {
  // miniF2F-lean4 puts each theorem in its own file under
  // MiniF2F/Test/foo.lean and MiniF2F/Valid/foo.lean. We glob the
  // directory rather than reading the index file at MiniF2F/Test.lean.
  const dir = join(src, "MiniF2F", splitName);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  const entries: MiniF2FEntry[] = [];
  const splitKey: "test" | "valid" = splitName === "Test" ? "test" : "valid";
  for (const file of files) {
    if (!file.endsWith(".lean")) continue;
    const text = await readFile(join(dir, file), "utf-8");
    const parsed = parseMiniF2FFile(text, splitKey);
    entries.push(...parsed);
  }
  return entries;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const src = await ensureSource(args.source);

  const entries: MiniF2FEntry[] = [];
  if (args.split !== "valid") {
    entries.push(...(await readSplitDir(src, "Test")));
  }
  if (args.split !== "test") {
    entries.push(...(await readSplitDir(src, "Valid")));
  }

  if (args.limit && entries.length > args.limit) {
    entries.length = args.limit;
  }

  const fixtures = miniF2FEntriesToFixtures(entries);
  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(args.output, JSON.stringify(fixtures, null, 2));
  console.log(
    `wrote ${fixtures.length} fixtures (from ${entries.length} miniF2F entries) → ${args.output}`
  );
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
