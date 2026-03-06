import { protectedProcedure, publicProcedure, router } from "@/lib/trpc/server";
import { adminImportRouter } from "@/lib/trpc/routers/admin-import";
import { adminResourceAccessRouter } from "@/lib/trpc/routers/admin-resource-access";
import { problemsRouter, problemSetsRouter, resourcesRouter, resourceSetsRouter } from "@/lib/trpc/routers/problems";

export const appRouter = router({
  healthcheck: publicProcedure.query(() => {
    return {
      status: "ok" as const,
      time: new Date().toISOString()
    };
  }),
  currentUser: publicProcedure.query(({ ctx }) => {
    return ctx.session?.user ?? null;
  }),
  listClasses: protectedProcedure.query(() => {
    return [] as Array<{ id: string; name: string }>;
  }),
  admin: router({
    import: adminImportRouter,
    resourceAccess: adminResourceAccessRouter
  }),
  resources: resourcesRouter,
  resourceSets: resourceSetsRouter,
  problems: problemsRouter,
  problemSets: problemSetsRouter
});

export type AppRouter = typeof appRouter;
