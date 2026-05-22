/**
 * Lazy loader for miniF2F fixtures.
 *
 * Run `pnpm -C apps/web exec tsx src/scripts/grading-eval/import-minif2f.ts`
 * once on a host with internet access — that writes
 * `minif2f.json` next to this file. Then the harness picks it up
 * automatically via `loadMiniF2FFixtures()`.
 *
 * We do not commit the JSON to git — it is ~150 KB per split and is
 * regenerated from the upstream repo on demand.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GradingFixture } from "../types";
import { fixtureSchema } from "../types";

const JSON_PATH = join(__dirname, "minif2f.json");

export function loadMiniF2FFixtures(): GradingFixture[] {
  if (!existsSync(JSON_PATH)) return [];
  const raw = JSON.parse(readFileSync(JSON_PATH, "utf-8")) as unknown[];
  return raw.map((entry) => fixtureSchema.parse(entry));
}

export function miniF2FAvailable(): boolean {
  return existsSync(JSON_PATH);
}
