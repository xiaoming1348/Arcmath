import { NextResponse } from "next/server";
import type { PrismaClient } from "@arcmath/db";
import { FREE_RESOURCE_SET_LIMIT } from "./membership";
import { consumeResourceAccessDecision } from "./resource-access";
import { getCachedOfficialPdfDownload } from "./official-pdf-cache";
import { generateAndCacheProblemSetPdf, getProblemSetPdfCacheKey } from "./problem-set-pdf-generation";

export type PdfVariant = "problems" | "answers";

type DeliveryPrisma = Pick<PrismaClient, "problemSet" | "userResourceAccess" | "$transaction" | "problem">;

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function parsePdfVariant(value: string | null): PdfVariant {
  return value === "answers" ? "answers" : "problems";
}

export async function getResourcePdfResponse(input: {
  prisma: DeliveryPrisma;
  userId: string;
  hasMembership: boolean;
  problemSetId: string;
  variant: PdfVariant;
}): Promise<Response> {
  const problemSet = await input.prisma.problemSet.findUnique({
    where: { id: input.problemSetId },
    select: {
      id: true,
      contest: true,
      year: true,
      exam: true,
      title: true,
      cachedPdfPath: true
    }
  });

  if (!problemSet) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }

  const access = await consumeResourceAccessDecision({
    prisma: input.prisma,
    userId: input.userId,
    problemSetId: problemSet.id,
    hasMembership: input.hasMembership,
    freeLimit: FREE_RESOURCE_SET_LIMIT
  });

  if (!access.allowed) {
    return NextResponse.json(
      { error: `File locked. You already used ${access.used}/${access.freeLimit} free files.` },
      { status: 403 }
    );
  }

  const filename = sanitizeFilename(
    `${problemSet.contest}_${problemSet.year}${problemSet.exam ? `_${problemSet.exam}` : ""}_${input.variant}.pdf`
  );

  const cacheKey = getProblemSetPdfCacheKey(problemSet.id, input.variant);
  const cachedDownload = await getCachedOfficialPdfDownload({
    problemSetId: cacheKey,
    locator: input.variant === "problems" ? problemSet.cachedPdfPath : undefined,
    filename
  });
  if (cachedDownload) {
    if (cachedDownload.type === "response") {
      return cachedDownload.response;
    }
    return NextResponse.redirect(cachedDownload.url, 302);
  }

  const generation = await generateAndCacheProblemSetPdf({
    prisma: input.prisma,
    problemSetId: problemSet.id,
    variant: input.variant
  });
  if (generation.ok) {
    return new NextResponse(generation.pdfBytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-length": String(generation.pdfBytes.length),
        "cache-control": "no-store"
      }
    });
  }

  return NextResponse.json(
    {
      error: `${input.variant === "answers" ? "Answers" : "Problems"} PDF is unavailable: ${generation.message}. Admin can run generation from /admin.`
    },
    { status: 409 }
  );
}
