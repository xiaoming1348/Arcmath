import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { hasActiveMembership } from "@/lib/membership";
import { getResourcePdfResponse, parsePdfVariant } from "@/lib/resource-pdf-delivery";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing resource id" }, { status: 400 });
  }
  const variant = parsePdfVariant(request.nextUrl.searchParams.get("variant"));

  return getResourcePdfResponse({
    prisma,
    userId: session.user.id,
    hasMembership: hasActiveMembership(session),
    problemSetId: id,
    variant
  });
}
