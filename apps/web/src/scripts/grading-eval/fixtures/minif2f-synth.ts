/**
 * Lazy loader for synthesized-attempt fixtures (`minif2f-synth.json`).
 *
 * Generate this file with `pnpm grading:synth-attempts`. Once present,
 * the eval CLI picks it up automatically and adds it to the fixture
 * pool alongside the seed set + minif2f.json.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GradingFixture } from "../types";
import { fixtureSchema } from "../types";

const JSON_PATH = join(__dirname, "minif2f-synth.json");

export function loadMiniF2FSynthFixtures(): GradingFixture[] {
  if (!existsSync(JSON_PATH)) return [];
  const raw = JSON.parse(readFileSync(JSON_PATH, "utf-8")) as unknown[];
  return raw.map((entry) => fixtureSchema.parse(entry));
}

export function miniF2FSynthAvailable(): boolean {
  return existsSync(JSON_PATH);
}
