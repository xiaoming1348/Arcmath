/**
 * Throwaway: dump recipes for a given list of problem IDs.
 * Used for spot-checking recipe quality after preprocess runs.
 */
import { prisma } from "@arcmath/db";

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Usage: inspect-recipes.ts <problemId> [<problemId> ...]");
    process.exit(1);
  }
  for (const id of ids) {
    const row = await prisma.problem.findUnique({
      where: { id },
      select: { milestoneChecks: true, statement: true, number: true, problemSet: { select: { contest: true, year: true, exam: true } } }
    });
    if (!row) {
      console.log(`\n=== ${id}: NOT FOUND ===`);
      continue;
    }
    const label = row.problemSet
      ? `${row.problemSet.contest} ${row.problemSet.year} ${row.problemSet.exam ?? ""} #${row.number}`
      : `#${row.number}`;
    console.log(`\n=== ${label} [${id}] ===`);
    console.log(`statement: ${(row.statement ?? "").slice(0, 240)}`);
    const r = row.milestoneChecks as {
      goalType?: string;
      goalStatement?: string;
      steps?: Array<{ index: number; title: string; claim: string; justification: string; technique: string[] }>;
      keyInsights?: string[];
      commonPitfalls?: string[];
    } | null;
    if (!r || typeof r !== "object") {
      console.log("(no recipe)");
      continue;
    }
    console.log(`goalType: ${r.goalType}`);
    console.log(`goalStatement: ${r.goalStatement}`);
    for (const s of r.steps ?? []) {
      console.log(`  #${s.index} ${s.title}  [${(s.technique ?? []).join("/")}]`);
      console.log(`      claim: ${s.claim.slice(0, 220)}`);
      console.log(`      just:  ${s.justification.slice(0, 220)}`);
    }
    console.log(`keyInsights:`);
    for (const k of r.keyInsights ?? []) console.log(`  - ${k}`);
    console.log(`commonPitfalls:`);
    for (const p of r.commonPitfalls ?? []) console.log(`  - ${p}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
