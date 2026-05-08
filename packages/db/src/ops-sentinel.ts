/**
 * "ArcMath Ops" sentinel organization — shared helpers.
 *
 * Platform administrators (User.role = ADMIN) need a baseline tenant to
 * anchor their UI context, so tRPC procedures that resolve
 * `ctx.membership` always return something meaningful when an admin
 * logs in, even before they've attached a temporary TEACHER membership
 * to a school they're supporting. We keep that home tenant as a
 * dedicated sentinel `Organization` row — never a real school — and
 * attach every ADMIN user to it as an OWNER.
 *
 * Two responsibilities live here:
 *   1. `ensureArcmathOpsSentinel`: called from prisma seed so the row
 *      exists (and so every ADMIN user has a membership in it). Safe to
 *      re-run; idempotent on `slug`.
 *   2. `ARCMATH_OPS_SENTINEL_SLUG`: the single source of truth for the
 *      slug string, so every other script (`close-support-session.ts`,
 *      future `/admin` routes) can refer to the same tenant without
 *      hard-coding its name in four places.
 *
 * Deliberately placed in `@arcmath/db` (and not `apps/web`) so prisma
 * seed can import it without crossing into the Next.js app's build
 * graph — the seed runs with the Prisma CLI, which doesn't know about
 * `@/` aliases or the Next bundler.
 */

import type { PrismaClient } from "@prisma/client";

/** Fixed slug. Don't rename — audit rows reference this string. */
export const ARCMATH_OPS_SENTINEL_SLUG = "arcmath-ops";

/** Fixed display name. Shows up in admin-facing analytics dashboards. */
export const ARCMATH_OPS_SENTINEL_NAME = "ArcMath Ops";

export type EnsureArcmathOpsSentinelResult = {
  organizationId: string;
  /** Number of ADMIN users that had no membership and got one created. */
  addedAdminMemberships: number;
  /** Number of ADMIN users whose existing membership was flipped back to ACTIVE
   *  (e.g. a previously disabled admin coming back). */
  reactivatedAdminMemberships: number;
  /** Total ADMIN users (pre-existing + newly covered) that now sit in the
   *  sentinel with an ACTIVE membership. */
  totalActiveAdmins: number;
};

/**
 * Idempotently ensure the sentinel Organization exists and every ADMIN
 * user has an ACTIVE OWNER membership in it.
 *
 * We explicitly do NOT touch non-ADMIN users' memberships here — that's
 * the job of the teacher-invite and student-join-code flows. And we do
 * NOT remove memberships for users whose role is later downgraded from
 * ADMIN; that's handled by whatever code does the role downgrade
 * (typically a one-off admin script).
 */
export async function ensureArcmathOpsSentinel(
  prisma: PrismaClient
): Promise<EnsureArcmathOpsSentinelResult> {
  // 1. Sentinel org — create-or-return. upsert on slug keeps the id
  //    stable across re-seeds, which matters because other scripts may
  //    hard-code the id in fixtures.
  const organization = await prisma.organization.upsert({
    where: { slug: ARCMATH_OPS_SENTINEL_SLUG },
    update: {
      // Only update the human-readable name; leave seat caps etc. alone
      // in case an operator has tuned them (this org is excluded from
      // normal pilot seat enforcement by virtue of not being a school).
      name: ARCMATH_OPS_SENTINEL_NAME
    },
    create: {
      slug: ARCMATH_OPS_SENTINEL_SLUG,
      name: ARCMATH_OPS_SENTINEL_NAME,
      // `planType` is a required enum; PAID signals "this is not a
      // trial tenant" to any dashboards that filter on it. The sentinel
      // doesn't have a trial end-date because it never expires.
      planType: "PAID",
      trialEndsAt: null,
      // Generous caps so the sentinel is never a bottleneck for admin
      // actions that require counting memberships — it's internal.
      maxAdminSeats: 100,
      maxTeacherSeats: 100,
      maxStudentSeats: 0,
      defaultLocale: "en"
    },
    select: { id: true }
  });

  // 2. Ensure every ADMIN user has an ACTIVE membership. We fetch the
  //    users and their existing membership in one round-trip to keep
  //    the logic readable; this table is tiny (≤ handful of admins).
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: {
      id: true,
      organizationMemberships: {
        where: { organizationId: organization.id },
        select: { id: true, status: true }
      }
    }
  });

  let addedAdminMemberships = 0;
  let reactivatedAdminMemberships = 0;

  for (const admin of admins) {
    const existing = admin.organizationMemberships[0];
    if (!existing) {
      await prisma.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userId: admin.id,
          role: "OWNER",
          status: "ACTIVE"
        }
      });
      addedAdminMemberships += 1;
      continue;
    }
    if (existing.status !== "ACTIVE") {
      await prisma.organizationMembership.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", role: "OWNER" }
      });
      reactivatedAdminMemberships += 1;
    }
    // else: already ACTIVE, nothing to do.
  }

  return {
    organizationId: organization.id,
    addedAdminMemberships,
    reactivatedAdminMemberships,
    totalActiveAdmins: admins.length
  };
}
