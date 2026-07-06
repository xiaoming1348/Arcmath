import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { getActiveOrganizationMembership } from "@/lib/organizations";
import { getOrganizationResourceStorage } from "@/lib/organization-resource-storage";
import {
  PdfPageRenderError,
  renderPdfPageToPng
} from "@/lib/pdf-page-render";

type RouteContext = {
  params: Promise<{
    resourceId: string;
  }>;
};

function isPdfResource(resource: {
  attachmentFilename: string | null;
  attachmentMimeType: string | null;
}): boolean {
  const mime = resource.attachmentMimeType?.toLowerCase() ?? "";
  const filename = resource.attachmentFilename?.toLowerCase() ?? "";
  return mime === "application/pdf" || filename.endsWith(".pdf");
}

function parsePage(url: URL): number | null {
  const raw = url.searchParams.get("page") ?? "1";
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getActiveOrganizationMembership(
    prisma,
    session.user.id
  );
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const page = parsePage(url);
  if (page == null) {
    return NextResponse.json(
      { error: "Page must be a positive integer." },
      { status: 400 }
    );
  }

  const { resourceId } = await context.params;
  const resource = await prisma.organizationResource.findFirst({
    where: {
      id: resourceId,
      organizationId: membership.organizationId
    },
    select: {
      id: true,
      attachmentLocator: true,
      attachmentFilename: true,
      attachmentMimeType: true
    }
  });

  if (!resource || !resource.attachmentLocator || !resource.attachmentFilename) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }
  if (!isPdfResource(resource)) {
    return NextResponse.json(
      { error: "Preview is only available for PDF resources." },
      { status: 400 }
    );
  }

  const storage = getOrganizationResourceStorage();
  const pdfBytes = await storage.readFile(resource.attachmentLocator);
  if (!pdfBytes) {
    return NextResponse.json({ error: "PDF file not found" }, { status: 404 });
  }

  try {
    const png = await renderPdfPageToPng({ pdfBytes, page });
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    if (error instanceof PdfPageRenderError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
