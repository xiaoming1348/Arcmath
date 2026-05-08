/**
 * Wipe all test data from the dev (= prod) Neon DB to give the
 * roster-creation flow a clean canvas. Preserves:
 *   - The platform admin (admin@arcmath.local)
 *   - All ProblemSet rows + Problem rows (curriculum content)
 *   - Migration history
 *
 * Removes:
 *   - Every Organization + cascading rows
 *   - Every User who has no remaining role tying them to platform
 *     content (i.e. anyone who isn't the platform admin)
 *
 * NOT idempotent-safe across multiple runs — the second run finds
 * nothing to delete and exits cleanly. Run once before pilot.
 */

import { prisma } from "@arcmath/db";

const PLATFORM_ADMIN_EMAIL = "admin@arcmath.local";

async function main() {
  console.log("== DB wipe: orgs + users (preserving content + platform admin) ==");

  const platformAdmin = await prisma.user.findUnique({
    where: { email: PLATFORM_ADMIN_EMAIL },
    select: { id: true }
  });
  if (!platformAdmin) {
    console.warn(`! ${PLATFORM_ADMIN_EMAIL} not found — proceeding anyway.`);
  } else {
    console.log(`Preserving platform admin id=${platformAdmin.id}`);
  }

  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`Found ${orgs.length} org(s) — deleting all of them.`);
  for (const org of orgs) {
    console.log(`  ${org.name}`);
  }

  // Drop orgs first; cascade nukes memberships, classes, class
  // assignments, organization resources, etc.
  await prisma.organization.deleteMany({});
  console.log("Organizations + cascading rows deleted.");

  // Now delete every User except the platform admin.
  const usersToDelete = await prisma.user.findMany({
    where: platformAdmin
      ? { id: { not: platformAdmin.id } }
      : {},
    select: { id: true }
  });
  console.log(`Deleting ${usersToDelete.length} user(s) (everyone except platform admin)...`);

  // batched delete to avoid timeout
  for (let i = 0; i < usersToDelete.length; i += 100) {
    const slice = usersToDelete.slice(i, i + 100);
    await prisma.user.deleteMany({
      where: { id: { in: slice.map((u) => u.id) } }
    });
    process.stdout.write(`\r  ${Math.min(i + 100, usersToDelete.length)} / ${usersToDelete.length}`);
  }
  console.log("\nUser cleanup complete.");

  // Final state
  const finalOrgs = await prisma.organization.count();
  const finalUsers = await prisma.user.count();
  const finalSets = await prisma.problemSet.count();
  console.log(`\n== After wipe ==`);
  console.log(`  Organizations: ${finalOrgs}`);
  console.log(`  Users: ${finalUsers}`);
  console.log(`  Problem sets (preserved): ${finalSets}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
