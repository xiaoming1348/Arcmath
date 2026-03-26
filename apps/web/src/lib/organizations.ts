import type { PrismaClient } from "@arcmath/db";

export type OrganizationMembershipContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: "OWNER" | "ADMIN" | "STUDENT";
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

export function canManageOrganization(role: OrganizationMembershipContext["role"]): boolean {
  return role === "OWNER" || role === "ADMIN";
}
