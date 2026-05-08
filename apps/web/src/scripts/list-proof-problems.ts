/**
 * Throwaway: list PROOF problems that have a milestoneChecks recipe,
 * so we can pick one to test the UI against.
 */
import { prisma, Prisma } from "@arcmath/db";

async function main() {
  const problems = await prisma.problem.findMany({
    where: {
      answerFormat: "PROOF",
      NOT: { milestoneChecks: { equals: Prisma.AnyNull } }
    },
    select: {
      id: true,
      number: true,
      problemSet: { select: { contest: true, year: true, exam: true } }
    },
    take: 20
  });
  for (const p of problems) {
    const ps = p.problemSet;
    const label = ps
      ? `${ps.contest} ${ps.year} ${ps.exam ?? ""} #${p.number}`
      : `#${p.number}`;
    console.log(`${p.id}  ${label}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
