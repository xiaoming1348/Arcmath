import { TRPCError, initTRPC } from "@trpc/server";
import { prisma } from "@arcmath/db";
import { canAccessAdmin } from "@arcmath/shared";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function createTRPCContext() {
  const session = await getServerSession(authOptions);
  return { prisma, session };
}

type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

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

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(enforceUser);
export const adminProcedure = t.procedure.use(enforceAdmin);
