/**
 * Drive `precomputeHintArtifacts` across every problem set marked
 * "live" in `real-tutor-rollout.ts`, so the runtime hint endpoint
 * can serve hints from the DB columns (curated/precomputed) and
 * doesn't have to call the LLM on each request.
 *
 * Why this exists: students were seeing the generic
 * "Think about the key concept" / "Try setting up the equation"
 * fallback hints on prod, even though local smoke runs produce
 * problem-specific LLM hints. The most likely cause is that the
 * runtime LLM call returns null on Vercel (missing OPENAI_API_KEY,
 * a function timeout, or a transient API error). Pre-computing the
 * hints offline and writing them into the
 * `Problem.generatedHintLevel{1,2,3}` columns means prod never
 * needs the LLM at request time — pickHintForAttempt finds the
 * precomputed text and returns immediately.
 *
 * Usage:
 *   bash scripts/with-env-local.sh \
 *     pnpm -C apps/web exec tsx \
 *       src/scripts/precompute-hints-all-live.ts [--force] [--limit-per-set N]
 *
 * `--force` re-generates hints even for problems that already have
 *   them (e.g. because we just changed the prompt template).
 * `--limit-per-set N` caps the number of problems processed inside
 *   each set; useful for a smoke pass before committing to a full run.
 *
 * Cost note: each problem hits the OpenAI Responses API 3 times
 * (one per hint level). With ~1370 live problems × 3 = ~4100 calls
 * at gpt-4.1-mini rates, the full run is roughly $1–3.
 */

import { prisma } from "@arcmath/db";
import { precomputeHintArtifacts } from "./precompute-hint-artifacts";
import { getRealTutorRolloutEntries } from "../lib/real-tutor-rollout";

type Cli = {
  force: boolean;
  limitPerSet?: number;
};

function parseArgs(argv: string[]): Cli {
  const flags: Cli = { force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--force") {
      flags.force = true;
    } else if (a === "--limit-per-set") {
      const n = Number(argv[i + 1]);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error("--limit-per-set must be a positive integer");
      }
      flags.limitPerSet = n;
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log("Usage: precompute-hints-all-live.ts [--force] [--limit-per-set N]");
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${a}`);
    }
  }
  return flags;
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  const liveEntries = getRealTutorRolloutEntries("live");
  console.log(`== precompute-hints-all-live ==`);
  console.log(`Live rollout entries: ${liveEntries.length}`);
  console.log(`Mode: ${flags.force ? "FORCE (regenerate existing)" : "skip-existing"}`);
  if (flags.limitPerSet) console.log(`Per-set cap: ${flags.limitPerSet} problems`);

  let totalScanned = 0;
  let totalGenerated = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const perSetRows: Array<{ label: string; setId: string; result: Awaited<ReturnType<typeof precomputeHintArtifacts>> }> = [];

  for (const entry of liveEntries) {
    const set = await prisma.problemSet.findFirst({
      where: { contest: entry.contest, year: entry.year, exam: entry.exam },
      select: { id: true, contest: true, year: true, exam: true }
    });
    if (!set) {
      console.warn(`!! missing DB row for ${entry.contest} ${entry.year} ${entry.exam ?? "-"} — skipping`);
      continue;
    }
    const label = `${set.contest} ${set.year}${set.exam ? " " + set.exam : ""}`;
    process.stdout.write(`\n[${label}] `);
    try {
      const result = await precomputeHintArtifacts({
        problemSetId: set.id,
        force: flags.force,
        limit: flags.limitPerSet
      });
      perSetRows.push({ label, setId: set.id, result });
      totalScanned += result.scanned;
      totalGenerated += result.generated;
      totalFailed += result.failed;
      totalSkipped += result.skippedCurated + result.skippedExisting + result.skippedIncomplete;
      console.log(
        `scanned=${result.scanned} generated=${result.generated} ` +
          `skipped(curated/existing/incomplete)=${result.skippedCurated}/${result.skippedExisting}/${result.skippedIncomplete} ` +
          `failed=${result.failed}`
      );
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
      totalFailed += 1;
    }
  }

  console.log(`\n== Done ==`);
  console.log(`Total scanned:   ${totalScanned}`);
  console.log(`Total generated: ${totalGenerated}`);
  console.log(`Total skipped:   ${totalSkipped}`);
  console.log(`Total failed:    ${totalFailed}`);
  await prisma.$disconnect();
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Crashed:", e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
