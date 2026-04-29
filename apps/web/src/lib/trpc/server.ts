import { TRPCError, initTRPC } from "@trpc/server";
import { prisma } from "@arcmath/db";
import { canAccessAdmin } from "@arcmath/shared";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  canManageOrganization,
  canTeach,
  getActiveOrganizationMembership,
  type OrgMembershipRole,
  type OrganizationMembershipContext
} from "@/lib/organizations";

export async function createTRPCContext() {
  const session = await getServerSession(authOptions);
  // Resolve the caller's active school membership up-front so every
  // procedure has the tenant already in scope. This is intentionally a
  // single query at context-build time: the alternative — lazy-loading
  // inside each procedure — led to subtle N+1s and forgot-to-scope bugs
  // in the old /org routes.
  const membership =
    session?.user?.id != null
      ? await getActiveOrganizationMembership(prisma, session.user.id)
      : null;
  return { prisma, session, membership };
}

// Widened context type: `membership` is optional so unit tests that
// hand-build a caller with just `{prisma, session}` keep working. At
// runtime createTRPCContext always populates it.
export type TRPCContext = {
  prisma: typeof prisma;
  session: Session | null;
  membership?: OrganizationMembershipContext | null;
};

const t = initTRPC.context<TRPCContext>().create();

const enforceUser = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session
    }
  });
});

const enforceAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  if (!canAccessAdmin(ctx.session.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session
    }
  });
});

/** User must be in an org and allowed to teach (OWNER/ADMIN/TEACHER). */
const enforceTeacher = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  // Global arcmath admins can act as any teacher (support playbook:
  // "log in as the teacher" is sometimes needed during the pilot).
  if (canAccessAdmin(ctx.session.user.role)) {
    if (!ctx.membership) {
      // An arcmath admin without an attached school can still reach the
      // teacher surfaces, but they need at least a tenant to act on. For
      // the pilot we refuse and steer them to a school-admin tool.
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Arcmath admin must be attached to a school tenant to use teacher tools"
      });
    }
    return next({
      ctx: { ...ctx, session: ctx.session, membership: ctx.membership }
    });
  }

  if (!ctx.membership || !canTeach(ctx.membership.role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      membership: ctx.membership satisfies OrganizationMembershipContext
    }
  });
});

/** User is the school-admin (OWNER / ADMIN) of their tenant. Teachers
 *  can't create other teachers or reset student accounts; only the
 *  school-admin can. */
const enforceSchoolAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (canAccessAdmin(ctx.session.user.role) && ctx.membership) {
    return next({ ctx: { ...ctx, session: ctx.session, membership: ctx.membership } });
  }
  if (!ctx.membership || !canManageOrganization(ctx.membership.role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({
    ctx: { ...ctx, session: ctx.session, membership: ctx.membership }
  });
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(enforceUser);
export const teacherProcedure = t.procedure.use(enforceTeacher);
export const schoolAdminProcedure = t.procedure.use(enforceSchoolAdmin);
export const adminProcedure = t.procedure.use(enforceAdmin);

export type { OrgMembershipRole };
