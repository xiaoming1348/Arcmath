/**
 * Audit script: list everything in the dev DB that's inconsistent
 * with the new "1 admin / N teachers / no standalone members"
 * roster-creation policy.
 *
 * Read-only — does NOT delete anything. Run this first to know
 * what cleanup-stale-data.ts (next file) would remove.
 */

import { prisma } from "@arcmath/db";

async function main() {
  console.log("== DB stale-data audit ==\n");

  // 1. Orgs and their member counts.
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      maxAdminSeats: true,
      maxTeacherSeats: true,
      maxStudentSeats: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: { role: true, user: { select: { email: true, name: true } } }
      }
    }
  });

  console.log(`Found ${orgs.length} organization(s).\n`);
  for (const org of orgs) {
    console.log(`Org: ${org.name} (slug=${org.slug}, id=${org.id})`);
    console.log(`  Caps: admin=${org.maxAdminSeats} teacher=${org.maxTeacherSeats} student=${org.maxStudentSeats}`);
    const byRole: Record<string, number> = {};
    for (const m of org.memberships) {
      byRole[m.role] = (byRole[m.role] ?? 0) + 1;
    }
    console.log(`  Active members: ${JSON.stringify(byRole)}`);
    if ((byRole.OWNER ?? 0) + (byRole.ADMIN ?? 0) > 1) {
      console.log("  ⚠ POLICY VIOLATION: > 1 admin/owner. Need to demote extras.");
    }
    for (const m of org.memberships) {
      console.log(`    - ${m.role}: ${m.user.name ?? "(no name)"} <${m.user.email}>`);
    }
    console.log();
  }

  // 2. Users without any active org membership (orphans).
  const orphans = await prisma.user.findMany({
    where: {
      organizationMemberships: {
        none: { status: "ACTIVE" }
      }
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true }
  });
  console.log(`\nOrphan users (no active org membership): ${orphans.length}`);
  for (const u of orphans.slice(0, 20)) {
    console.log(`  - ${u.email} (role=${u.role}, name=${u.name ?? "—"})`);
  }
  if (orphans.length > 20) {
    console.log(`  ...and ${orphans.length - 20} more`);
  }

  // 3. Classes without a populated assignedTeacherId (legacy).
  const classes = await prisma.class.findMany({
    select: {
      id: true,
      name: true,
      organizationId: true,
      assignedTeacherId: true,
      joinCode: true,
      _count: { select: { enrollments: true, assignments: true } }
    }
  });
  const legacyClasses = classes.filter((c) => !c.assignedTeacherId);
  console.log(`\nClasses missing assignedTeacherId (legacy): ${legacyClasses.length} of ${classes.length}`);
  for (const c of legacyClasses.slice(0, 10)) {
    console.log(`  - "${c.name}" org=${c.organizationId} enrollments=${c._count.enrollments} joinCode=${c.joinCode ?? "—"}`);
  }

  // 4. Classes that DO have join codes (orphan UI artifact).
  const withJoinCode = classes.filter((c) => c.joinCode);
  console.log(`\nClasses with non-null joinCode (UI ignores them, but DB still has them): ${withJoinCode.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
