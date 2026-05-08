import { prisma } from "@arcmath/db";

async function main() {
  const sets = await prisma.problemSet.findMany({
    where: {
      contest: { in: ["EUCLID", "MAT", "STEP", "USAMO"] },
      category: "REAL_EXAM"
    },
    select: {
      id: true,
      contest: true,
      year: true,
      exam: true,
      _count: { select: { problems: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  console.log("Newly imported REAL_EXAM problem sets:");
  for (const s of sets) {
    const examTag = s.exam ? ` (${s.exam})` : "";
    console.log(`  ${s.contest} ${s.year}${examTag} — ${s._count.problems} problems`);
    console.log(`    /problems/set/${s.id}`);
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
