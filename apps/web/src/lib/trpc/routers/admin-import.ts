import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "@/lib/trpc/server";
import { buildImportPreview, commitImportFromJson } from "@/lib/imports/contest-import";

const importPayloadInputSchema = z.object({
  jsonText: z.string().min(2, "jsonText is required"),
  filename: z.string().min(1).max(255).optional()
});

export const adminImportRouter = router({
  preview: adminProcedure.input(importPayloadInputSchema).mutation(async ({ ctx, input }) => {
    return buildImportPreview(ctx.prisma, input.jsonText);
  }),

  commit: adminProcedure.input(importPayloadInputSchema).mutation(async ({ ctx, input }) => {
    const preview = await buildImportPreview(ctx.prisma, input.jsonText);
    if (!preview.isValid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Import payload is invalid",
        cause: preview.errors
      });
    }

    try {
      return await commitImportFromJson({
        prisma: ctx.prisma,
        jsonText: input.jsonText,
        filename: input.filename,
        uploadedByUserId: ctx.session.user.id
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import commit failed";
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message
      });
    }
  })
});
