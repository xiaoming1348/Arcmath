import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canTeach, getActiveOrganizationMembership } from "@/lib/organizations";
import {
  createParentInvite,
  isPlausibleEmail,
  sendParentInviteEmail
} from "@/lib/parent-invite";

/**
 * POST /api/org/students/[userId]/invite-parent
 *
 * Teacher-initiated parent invite. Issues a single-use, 30-day token
 * (more precisely: a token where multiple opens are fine but it expires
 * after 30 days), persists it in ParentInvite, sends an email via
 * Resend with the magic link.
 *
 * Auth:
 *   - Caller must be logged in
 *   - Caller's active org membership must satisfy canTeach()
 *   - Target student must be in the SAME org (tenant boundary)
 */

export const runtime = "nodejs";

type Body = {
  parentEmail?: unknown;
  relationship?: unknown;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getActiveOrganizationMembership(prisma, session.user.id);
  if (!membership || !canTeach(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId: studentUserId } = await params;

  // Verify the student is in the same org. Avoids cross-tenant leaks.
  const studentRow = await prisma.organizationMembership.findFirst({
    where: {
      organizationId: membership.organizationId,
      userId: studentUserId,
      role: "STUDENT"
    },
    select: {
      user: { select: { id: true, name: true, email: true } },
      organization: { select: { name: true } }
    }
  });
  if (!studentRow) {
    return NextResponse.json(
      { error: "Student not in your organization" },
      { status: 404 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parentEmail =
    typeof body.parentEmail === "string" ? body.parentEmail.trim() : "";
  if (!parentEmail || !isPlausibleEmail(parentEmail)) {
    return NextResponse.json(
      { error: "parentEmail is required and must look like an email" },
      { status: 400 }
    );
  }
  const relationship =
    typeof body.relationship === "string"
      ? body.relationship.trim().slice(0, 64) || null
      : null;

  // Self-invite guard: a teacher inviting their OWN email as parent is
  // almost certainly a mistake (and would let them see their own data
  // through the parent page, which is fine, but also weird).
  if (
    parentEmail.toLowerCase() === (studentRow.user.email ?? "").toLowerCase()
  ) {
    return NextResponse.json(
      { error: "Parent email cannot be the same as the student's email" },
      { status: 400 }
    );
  }

  const created = await createParentInvite({
    prisma,
    studentUserId,
    parentEmail,
    invitedByUserId: session.user.id,
    organizationId: membership.organizationId,
    relationship
  });
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 500 });
  }

  const sent = await sendParentInviteEmail({
    parentEmail,
    studentName: studentRow.user.name,
    organizationName: studentRow.organization.name,
    token: created.token,
    expiresAt: created.expiresAt,
    relationship
  });
  if (!sent.ok) {
    // The DB row exists but email failed. Surface this — the teacher
    // can retry, and the row will linger as an unused token (no harm).
    return NextResponse.json(
      { error: `Invite saved, but email failed: ${sent.error}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    inviteId: created.inviteId,
    expiresAt: created.expiresAt.toISOString()
  });
}
