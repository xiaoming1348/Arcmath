import type { PrismaClient } from "@arcmath/db";

/** Mirrors Prisma's OrganizationMembershipRole enum. Kept as a hand-written
 *  union so consumers can narrow without importing the Prisma generated
 *  types directly. */
export type OrgMembershipRole = "OWNER" | "ADMIN" | "TEACHER" | "STUDENT";

export type OrganizationMembershipContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrgMembershipRole;
};

export async function getActiveOrganizationMembership(
  prisma: PrismaClient,
  userId: string
): Promise<OrganizationMembershipContext | null> {
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId,
      status: "ACTIVE"
    },
    orderBy: [
      { role: "asc" },
      { createdAt: "asc" }
    ],
    select: {
      organizationId: true,
      role: true,
      organization: {
        select: {
          name: true,
          slug: true
        }
      }
    }
  });

  if (!membership) {
    return null;
  }

  return {
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    organizationSlug: membership.organization.slug,
    role: membership.role
  };
}

export function canManageOrganization(role: OrgMembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Teachers (plus owners/admins) can create classes + assignments, see
 *  class dashboards, and override grades for their students. Pure students
 *  cannot. Kept as a single predicate so the tRPC middleware and the UI
 *  gate agree on the same rule. */
export function canTeach(role: OrgMembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "TEACHER";
}
