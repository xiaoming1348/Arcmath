import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import {
  canManageOrganization,
  getActiveOrganizationMembership
} from "@/lib/organizations";

type OrgAccountPageProps = {
  params: Promise<{
    userId: string;
  }>;
};

function formatDate(value: Date | null | undefined): string {
  if (!value) return "Never";
  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function asPercent(correct: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((correct / total) * 100)}%`;
}

export default async function OrgAccountPage({ params }: OrgAccountPageProps) {
  const { userId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/org/accounts/${userId}`)}`);
  }

  const membership = await getActiveOrganizationMembership(prisma, session.user.id);
  if (!membership || !canManageOrganization(membership.role)) {
    redirect("/org");
  }

  const targetMembership = await prisma.organizationMembership.findFirst({
    where: {
      organizationId: membership.organizationId,
      userId
    },
    select: {
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          locale: true,
          feedbackLocale: true,
          emailVerifiedAt: true,
          passwordHash: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });

  if (!targetMembership) {
    notFound();
  }

  const [
    classesTaught,
    enrollments,
    problemSetUploads,
    resourcesCreated,
    structuredAssignmentsCreated,
    resourceAssignmentsCreated,
    practiceRuns,
    submittedAttempts,
    correctAttempts,
    resourceSubmissions,
    recentAuditEvents
  ] = await Promise.all([
    prisma.class.findMany({
      where: {
        organizationId: membership.organizationId,
        OR: [{ assignedTeacherId: userId }, { createdByUserId: userId }]
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        assignedTeacherId: true,
        _count: {
          select: {
            enrollments: true,
            assignments: true,
            resourceAssignments: true
          }
        }
      }
    }),
    prisma.enrollment.findMany({
      where: {
        userId,
        class: { organizationId: membership.organizationId }
      },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        class: {
          select: {
            id: true,
            name: true,
            assignedTeacher: { select: { name: true, email: true } }
          }
        }
      }
    }),
    prisma.problemSet.findMany({
      where: {
        ownerOrganizationId: membership.organizationId,
        ownerUserId: userId
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        visibility: true,
        createdAt: true,
        _count: { select: { problems: true } }
      }
    }),
    prisma.organizationResource.findMany({
      where: {
        organizationId: membership.organizationId,
        createdByUserId: userId
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        attachmentFilename: true,
        attachmentMimeType: true,
        createdAt: true
      }
    }),
    prisma.classAssignment.findMany({
      where: {
        createdByUserId: userId,
        class: { organizationId: membership.organizationId }
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        dueAt: true,
        createdAt: true,
        class: { select: { id: true, name: true } },
        problemSet: { select: { title: true } }
      }
    }),
    prisma.resourceAssignment.findMany({
      where: {
        organizationId: membership.organizationId,
        createdByUserId: userId
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        dueAt: true,
        createdAt: true,
        class: { select: { id: true, name: true } },
        resource: { select: { title: true, attachmentFilename: true } },
        _count: { select: { submissions: true } }
      }
    }),
    prisma.practiceRun.findMany({
      where: {
        organizationId: membership.organizationId,
        userId
      },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        id: true,
        startedAt: true,
        completedAt: true,
        problemSet: { select: { title: true } },
        attempts: {
          where: { status: "SUBMITTED" },
          select: { isCorrect: true }
        }
      }
    }),
    prisma.problemAttempt.count({
      where: { userId, status: "SUBMITTED" }
    }),
    prisma.problemAttempt.count({
      where: { userId, status: "SUBMITTED", isCorrect: true }
    }),
    prisma.resourceAssignmentSubmission.findMany({
      where: {
        studentUserId: userId,
        assignment: { organizationId: membership.organizationId }
      },
      orderBy: { submittedAt: "desc" },
      take: 10,
      select: {
        id: true,
        submittedAt: true,
        gradeScore: true,
        gradeMax: true,
        gradedAt: true,
        assignment: {
          select: {
            title: true,
            class: { select: { id: true, name: true } },
            resource: { select: { title: true } }
          }
        }
      }
    }),
    prisma.auditLogEvent.findMany({
      where: {
        organizationId: membership.organizationId,
        actorUserId: userId
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true
      }
    })
  ]);

  const completedRuns = practiceRuns.filter((run) => run.completedAt).length;
  const orgAttemptTotal = practiceRuns.reduce(
    (sum, run) => sum + run.attempts.length,
    0
  );
  const orgCorrectTotal = practiceRuns.reduce(
    (sum, run) => sum + run.attempts.filter((attempt) => attempt.isCorrect).length,
    0
  );

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <span className="badge">{membership.organizationName}</span>
            <h1 className="text-2xl font-semibold text-slate-900">
              {targetMembership.user.name ?? targetMembership.user.email}
            </h1>
            <p className="text-sm text-slate-600">
              {targetMembership.user.email} · org role {targetMembership.role} · platform role {targetMembership.user.role}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {targetMembership.role === "STUDENT" ? (
              <Link
                className="btn-secondary"
                href={`/org/students/${encodeURIComponent(targetMembership.user.id)}`}
              >
                Learning detail
              </Link>
            ) : null}
            <Link className="btn-secondary" href="/org">
              Back to Organization
            </Link>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Membership" value={targetMembership.status} />
          <MetricCard label="Joined org" value={formatDate(targetMembership.createdAt)} />
          <MetricCard
            label="Password"
            value={targetMembership.user.passwordHash ? "Set" : "Needs setup"}
          />
          <MetricCard
            label="Email verified"
            value={targetMembership.user.emailVerifiedAt ? "Yes" : "No"}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <InfoPanel title="Account profile">
          <dl className="grid gap-2 text-sm">
            <InfoRow label="User ID" value={targetMembership.user.id} mono />
            <InfoRow label="Email" value={targetMembership.user.email} />
            <InfoRow label="Name" value={targetMembership.user.name ?? "—"} />
            <InfoRow label="UI locale" value={targetMembership.user.locale ?? "Default"} />
            <InfoRow
              label="Feedback locale"
              value={targetMembership.user.feedbackLocale ?? "Default"}
            />
            <InfoRow label="Created" value={formatDate(targetMembership.user.createdAt)} />
            <InfoRow label="Updated" value={formatDate(targetMembership.user.updatedAt)} />
          </dl>
        </InfoPanel>

        <InfoPanel title="Student work summary">
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard label="Org runs" value={String(practiceRuns.length)} />
            <MetricCard label="Completed" value={String(completedRuns)} />
            <MetricCard
              label="Org accuracy"
              value={asPercent(orgCorrectTotal, orgAttemptTotal)}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Lifetime attempts across all catalog work: {submittedAttempts} submitted · {correctAttempts} correct.
          </p>
        </InfoPanel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <InfoPanel title="Classes taught / created">
          {classesTaught.length === 0 ? (
            <EmptyLine>No classes taught or created by this account.</EmptyLine>
          ) : (
            <ul className="space-y-2">
              {classesTaught.map((klass) => (
                <li key={klass.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <Link
                    href={`/teacher/classes/${encodeURIComponent(klass.id)}`}
                    className="font-semibold text-slate-900 hover:text-[var(--accent)]"
                  >
                    {klass.name}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    {klass._count.enrollments} students · {klass._count.assignments + klass._count.resourceAssignments} assignments · created {formatDate(klass.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </InfoPanel>

        <InfoPanel title="Classes enrolled">
          {enrollments.length === 0 ? (
            <EmptyLine>No class enrollments for this account.</EmptyLine>
          ) : (
            <ul className="space-y-2">
              {enrollments.map((enrollment) => (
                <li key={enrollment.class.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <Link
                    href={`/teacher/classes/${encodeURIComponent(enrollment.class.id)}`}
                    className="font-semibold text-slate-900 hover:text-[var(--accent)]"
                  >
                    {enrollment.class.name}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    Teacher: {enrollment.class.assignedTeacher?.name ?? enrollment.class.assignedTeacher?.email ?? "Unassigned"} · enrolled {formatDate(enrollment.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </InfoPanel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <InfoPanel title="Created assignments">
          <AssignmentList
            structured={structuredAssignmentsCreated}
            resource={resourceAssignmentsCreated}
          />
        </InfoPanel>

        <InfoPanel title="Uploaded materials">
          {problemSetUploads.length === 0 && resourcesCreated.length === 0 ? (
            <EmptyLine>No uploaded problem sets or PDF resources.</EmptyLine>
          ) : (
            <div className="space-y-3">
              {problemSetUploads.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Problem sets
                  </p>
                  <ul className="space-y-2">
                    {problemSetUploads.map((set) => (
                      <li key={set.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="font-semibold text-slate-900">{set.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {set._count.problems} problems · {set.status} · {set.visibility} · {formatDate(set.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {resourcesCreated.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    PDF / org resources
                  </p>
                  <ul className="space-y-2">
                    {resourcesCreated.map((resource) => (
                      <li key={resource.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">{resource.title}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {resource.attachmentFilename ?? "Text only"} · {resource.attachmentMimeType ?? "resource"} · {formatDate(resource.createdAt)}
                            </p>
                          </div>
                          {resource.attachmentFilename ? (
                            <Link
                              href={`/api/org-resources/${resource.id}/download`}
                              className="btn-secondary"
                            >
                              Open
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </InfoPanel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <InfoPanel title="Recent practice runs">
          {practiceRuns.length === 0 ? (
            <EmptyLine>No organization-linked practice runs.</EmptyLine>
          ) : (
            <ul className="space-y-2">
              {practiceRuns.map((run) => {
                const total = run.attempts.length;
                const correct = run.attempts.filter((attempt) => attempt.isCorrect).length;
                return (
                  <li key={run.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="font-semibold text-slate-900">{run.problemSet.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {correct}/{total} correct · started {formatDate(run.startedAt)} · {run.completedAt ? `completed ${formatDate(run.completedAt)}` : "in progress"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </InfoPanel>

        <InfoPanel title="PDF submissions">
          {resourceSubmissions.length === 0 ? (
            <EmptyLine>No PDF/manual submissions.</EmptyLine>
          ) : (
            <ul className="space-y-2">
              {resourceSubmissions.map((submission) => (
                <li key={submission.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-900">
                    {submission.assignment.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {submission.assignment.class.name} · {submission.assignment.resource.title} · submitted {formatDate(submission.submittedAt)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {submission.gradedAt
                      ? `Grade ${submission.gradeScore} / ${submission.gradeMax} · ${formatDate(submission.gradedAt)}`
                      : "Not graded"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </InfoPanel>
      </section>

      <InfoPanel title="Recent audit activity">
        {recentAuditEvents.length === 0 ? (
          <EmptyLine>No recent audit events from this account.</EmptyLine>
        ) : (
          <ol className="space-y-2">
            {recentAuditEvents.map((event) => (
              <li key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">{event.action}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {event.targetType ?? "Target"} {event.targetId ?? "—"} · {formatDate(event.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </InfoPanel>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function InfoPanel({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function InfoRow({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:grid-cols-[140px_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className={mono ? "break-all font-mono text-xs text-slate-800" : "break-words text-slate-800"}>
        {value}
      </dd>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-600">{children}</p>;
}

function AssignmentList({
  structured,
  resource
}: {
  structured: Array<{
    id: string;
    title: string;
    dueAt: Date | null;
    createdAt: Date;
    class: { id: string; name: string };
    problemSet: { title: string };
  }>;
  resource: Array<{
    id: string;
    title: string;
    dueAt: Date | null;
    createdAt: Date;
    class: { id: string; name: string };
    resource: { title: string; attachmentFilename: string | null };
    _count: { submissions: number };
  }>;
}) {
  if (structured.length === 0 && resource.length === 0) {
    return <EmptyLine>No assignments created by this account.</EmptyLine>;
  }

  return (
    <div className="space-y-3">
      {structured.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Problem sets
          </p>
          <ul className="space-y-2">
            {structured.map((assignment) => (
              <li key={assignment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">{assignment.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {assignment.class.name} · {assignment.problemSet.title} · due {formatDate(assignment.dueAt)} · created {formatDate(assignment.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {resource.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            PDF / manual
          </p>
          <ul className="space-y-2">
            {resource.map((assignment) => (
              <li key={assignment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">{assignment.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {assignment.class.name} · {assignment.resource.title} · {assignment._count.submissions} submissions · due {formatDate(assignment.dueAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
