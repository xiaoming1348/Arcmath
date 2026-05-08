import { prisma } from "@arcmath/db";
import { buildRealExamProblemSetWhere } from "@/lib/tutor-usable-sets";

async function main() {
  const where = buildRealExamProblemSetWhere();
  const sets = await prisma.problemSet.findMany({
    where,
    select: { id: true, contest: true, year: true, exam: true, _count: { select: { problems: true } } }
  });
  console.log("Sets matching buildRealExamProblemSetWhere() AFTER whitelist update:");
  for (const s of sets) {
    console.log(`  ${s.contest} ${s.year}${s.exam ? ` (${s.exam})` : ""} — ${s._count.problems} problems`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
