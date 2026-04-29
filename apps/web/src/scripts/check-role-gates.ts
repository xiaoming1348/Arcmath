/**
 * Smoke test for the Batch-1 role gates.
 *
 * Picks one user per (org-admin / teacher / student) role from the
 * dev DB and prints what TopNav + the route-level redirects would do
 * for them. Doesn't actually hit the HTTP server — it inspects the
 * same `OrganizationMembership` row the page logic reads, so we can
 * eyeball the gate without juggling cookies and login forms.
 */

import { prisma } from "@arcmath/db";

async function main() {
  const memberships = await prisma.organizationMembership.findMany({
    where: { status: "ACTIVE" },
    select: {
      role: true,
      user: { select: { email: true, role: true } },
      organization: { select: { name: true } }
    },
    take: 20
  });

  console.log("Active memberships:");
  console.table(
    memberships.map((m) => ({
      email: m.user.email,
      org: m.organization.name,
      orgRole: m.role,
      userRole: m.user.role
    }))
  );

  // Predicate copies of canManageOrganization / canTeach (kept inline so
  // we don't have to thread imports through tsx path-resolution).
  const isManager = (r: string) => r === "OWNER" || r === "ADMIN";
  const isTeacher = (r: string) => r === "OWNER" || r === "ADMIN" || r === "TEACHER";

  console.log("\nExpected route landing per role:");
  for (const m of memberships) {
    const r = m.role;
    let landing: string;
    if (isManager(r)) landing = "/org";
    else if (isTeacher(r)) landing = "/teacher";
    else if (r === "STUDENT") landing = "/student";
    else landing = "/dashboard";
    console.log(`  ${m.user.email} (${r}) → ${landing}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
