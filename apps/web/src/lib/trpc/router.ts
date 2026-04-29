import { protectedProcedure, publicProcedure, router } from "@/lib/trpc/server";
import { adminAnalyticsRouter } from "@/lib/trpc/routers/admin-analytics";
import { adminImportRouter } from "@/lib/trpc/routers/admin-import";
import { adminResourceAccessRouter } from "@/lib/trpc/routers/admin-resource-access";
import { adminReviewRouter } from "@/lib/trpc/routers/admin-review";
import { learningReportRouter } from "@/lib/trpc/routers/learning-report";
import { orgAdminRouter } from "@/lib/trpc/routers/org-admin";
import { problemsRouter, problemSetsRouter, resourcesRouter, resourceSetsRouter } from "@/lib/trpc/routers/problems";
import { studentRouter } from "@/lib/trpc/routers/student";
import { teacherRouter } from "@/lib/trpc/routers/teacher";
import { unifiedAttemptRouter } from "@/lib/trpc/routers/unified-attempt";

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
    analytics: adminAnalyticsRouter,
    import: adminImportRouter,
    resourceAccess: adminResourceAccessRouter,
    review: adminReviewRouter
  }),
  unifiedAttempt: unifiedAttemptRouter,
  learningReport: learningReportRouter,
  resources: resourcesRouter,
  resourceSets: resourceSetsRouter,
  problems: problemsRouter,
  problemSets: problemSetsRouter,
  student: studentRouter,
  teacher: teacherRouter,
  orgAdmin: orgAdminRouter
});

export type AppRouter = typeof appRouter;
