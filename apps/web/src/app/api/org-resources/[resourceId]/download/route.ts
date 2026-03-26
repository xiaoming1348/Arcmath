import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { getActiveOrganizationMembership } from "@/lib/organizations";
import { getOrganizationResourceStorage } from "@/lib/organization-resource-storage";

type RouteContext = {
  params: Promise<{
    resourceId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login?callbackUrl=%2Fresources", process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
  }

  const membership = await getActiveOrganizationMembership(prisma, session.user.id);
  if (!membership) {
    return NextResponse.redirect(new URL("/dashboard", process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
  }

  const { resourceId } = await context.params;
  const resource = await prisma.organizationResource.findFirst({
    where: {
      id: resourceId,
      organizationId: membership.organizationId
    },
    select: {
      attachmentLocator: true,
      attachmentFilename: true,
      attachmentMimeType: true
    }
  });

  if (!resource || !resource.attachmentLocator || !resource.attachmentFilename) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const storage = getOrganizationResourceStorage();
  const download = await storage.getDownloadResponse(
    resource.attachmentLocator,
    resource.attachmentFilename,
    resource.attachmentMimeType
  );

  if (!download) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  if (download.type === "redirect") {
    return NextResponse.redirect(download.url);
  }

  return download.response;
}
