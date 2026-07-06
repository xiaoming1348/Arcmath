import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import {
  canManageOrganization,
  canTeach,
  getActiveOrganizationMembership
} from "@/lib/organizations";
import { getOrganizationResourceStorage } from "@/lib/organization-resource-storage";

type RouteContext = {
  params: Promise<{
    submissionId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { submissionId } = await context.params;
  const submission = await prisma.resourceAssignmentSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      studentUserId: true,
      attachmentLocator: true,
      attachmentFilename: true,
      attachmentMimeType: true,
      assignment: {
        select: {
          organizationId: true,
          class: {
            select: {
              organizationId: true,
              createdByUserId: true,
              assignedTeacherId: true,
              enrollments: {
                where: { userId: session.user.id },
                select: { id: true }
              }
            }
          }
        }
      }
    }
  });

  if (
    !submission ||
    !submission.attachmentLocator ||
    !submission.attachmentFilename
  ) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const isStudentOwner = submission.studentUserId === session.user.id;
  const membership = await getActiveOrganizationMembership(
    prisma,
    session.user.id
  );
  const isSameOrg =
    membership?.organizationId === submission.assignment.organizationId &&
    submission.assignment.class.organizationId === submission.assignment.organizationId;
  const isTeacherForClass =
    isSameOrg &&
    membership != null &&
    canTeach(membership.role) &&
    (canManageOrganization(membership.role) ||
      submission.assignment.class.assignedTeacherId === session.user.id ||
      submission.assignment.class.createdByUserId === session.user.id);
  const isEnrolledStudent =
    isStudentOwner && submission.assignment.class.enrollments.length > 0;

  if (!isEnrolledStudent && !isTeacherForClass) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storage = getOrganizationResourceStorage();
  const download = await storage.getDownloadResponse(
    submission.attachmentLocator,
    submission.attachmentFilename,
    submission.attachmentMimeType
  );

  if (!download) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  if (download.type === "redirect") {
    return NextResponse.redirect(download.url);
  }

  return download.response;
}
