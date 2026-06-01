import { unstable_cache } from "next/cache";
import { prisma } from "@arcmath/db";
import type { OrganizationMembershipContext } from "@/lib/organizations";

const NAV_MEMBERSHIP_CACHE_SECONDS = 60;

export const getActiveOrganizationMembershipForNav = unstable_cache(
  async function getActiveOrganizationMembershipForNav(
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
  },
  ["active-organization-membership-for-nav-v1"],
  { revalidate: NAV_MEMBERSHIP_CACHE_SECONDS }
);
