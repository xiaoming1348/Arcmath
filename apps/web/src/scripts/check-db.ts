import { prisma } from "@arcmath/db";

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, role: true },
    take: 10
  });
  console.log("Users (up to 10):");
  console.log(users);

  const sets = await prisma.problemSet.findMany({
    select: { contest: true, year: true, exam: true, category: true },
    take: 30,
    orderBy: { createdAt: "desc" }
  });
  console.log("\nExisting problemSets (most recent 30):");
  console.log(sets);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
