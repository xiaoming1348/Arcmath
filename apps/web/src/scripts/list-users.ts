/** Throwaway: list existing users so we can log into the UI. */
import { prisma } from "@arcmath/db";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, name: true },
    take: 10
  });
  for (const u of users) {
    console.log(`${u.id}  ${u.email ?? "(no email)"}  ${u.role}  ${u.name ?? ""}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
