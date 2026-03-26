import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canManageOrganization, getActiveOrganizationMembership } from "@/lib/organizations";

type OrganizationStudentPageProps = {
  params: Promise<{
    userId: string;
  }>;
};

function formatDate(value: Date | null): string {
  if (!value) {
    return "Not completed";
  }

  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatTopicLabel(topicKey: string): string {
  return topicKey
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function extractReinforcementTopics(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const maybeTopics = (value as { topicsNeedingReinforcement?: unknown }).topicsNeedingReinforcement;
  if (!Array.isArray(maybeTopics)) {
    return [];
  }

  return maybeTopics.filter((topic): topic is string => typeof topic === "string" && topic.trim().length > 0);
}

export default async function OrganizationStudentPage({ params }: OrganizationStudentPageProps) {
  const { userId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/org/students/${userId}`)}`);
  }

  const membership = await getActiveOrganizationMembership(prisma, session.user.id);
  if (!membership || !canManageOrganization(membership.role)) {
    redirect("/org");
  }

  const studentMembership = await prisma.organizationMembership.findFirst({
    where: {
      organizationId: membership.organizationId,
      userId
    },
    select: {
      role: true,
      status: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true
        }
      }
    }
  });

  if (!studentMembership) {
    notFound();
  }

  const [practiceRuns, reportSnapshots] = await Promise.all([
    prisma.practiceRun.findMany({
      where: {
        organizationId: membership.organizationId,
        userId
      },
      orderBy: {
        startedAt: "desc"
      },
      take: 20,
      select: {
        id: true,
        startedAt: true,
        completedAt: true,
        problemSet: {
          select: {
            title: true
          }
        },
        attempts: {
          select: {
            isCorrect: true
          }
        },
        learningReportSnapshot: {
          select: {
            id: true,
            generatedAt: true
          }
        }
      }
    }),
    prisma.learningReportSnapshot.findMany({
      where: {
        organizationId: membership.organizationId,
        userId
      },
      orderBy: {
        generatedAt: "desc"
      },
      take: 20,
      select: {
        id: true,
        generatedAt: true,
        reportJson: true,
        practiceRun: {
          select: {
            problemSet: {
              select: {
                title: true
              }
            }
          }
        }
      }
    })
  ]);

  const completedRuns = practiceRuns.filter((run) => run.completedAt);
  const totalAttempts = practiceRuns.reduce((sum, run) => sum + run.attempts.length, 0);
  const totalCorrect = practiceRuns.reduce(
    (sum, run) => sum + run.attempts.filter((attempt) => attempt.isCorrect).length,
    0
  );
  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  const reinforcementTopicCounts = new Map<string, number>();
  for (const snapshot of reportSnapshots) {
    for (const topicKey of extractReinforcementTopics(snapshot.reportJson)) {
      reinforcementTopicCounts.set(topicKey, (reinforcementTopicCounts.get(topicKey) ?? 0) + 1);
    }
  }

  const topTopics = Array.from(reinforcementTopicCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5);

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <span className="badge">Organization Student View</span>
            <h1 className="text-2xl font-semibold text-slate-900">
              {studentMembership.user.name ?? studentMembership.user.email}
            </h1>
            <p className="text-sm text-slate-600">
              {studentMembership.user.email} · {studentMembership.role} · {studentMembership.status}
            </p>
          </div>
          <Link className="btn-secondary" href="/org">
            Back to Organization
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed runs</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{completedRuns.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total attempts</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{totalAttempts}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accuracy</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{accuracy}%</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Snapshots</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{reportSnapshots.length}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Most frequent reinforcement topics</h2>
          {topTopics.length > 0 ? (
            <ul className="space-y-2 text-sm text-slate-700">
              {topTopics.map(([topicKey, count]) => (
                <li key={topicKey} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span>{formatTopicLabel(topicKey)}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {count} snapshot{count === 1 ? "" : "s"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No reinforcement pattern has been recorded for this student yet.</p>
          )}
        </div>

        <div className="surface-card space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Recent report snapshots</h2>
          {reportSnapshots.length > 0 ? (
            <div className="space-y-2">
              {reportSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{snapshot.practiceRun.problemSet.title}</p>
                      <p className="text-xs text-slate-500">Generated {formatDate(snapshot.generatedAt)}</p>
                    </div>
                    <Link className="btn-secondary" href={`/org/reports/${snapshot.id}`}>
                      Open Snapshot
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">No snapshots have been generated for this student yet.</p>
          )}
        </div>
      </section>

      <section className="surface-card space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Recent practice runs</h2>
        {practiceRuns.length > 0 ? (
          <div className="space-y-2">
            {practiceRuns.map((run) => {
              const runAttemptCount = run.attempts.length;
              const runCorrectCount = run.attempts.filter((attempt) => attempt.isCorrect).length;

              return (
                <div key={run.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{run.problemSet.title}</p>
                      <p className="text-sm text-slate-600">
                        {runCorrectCount}/{runAttemptCount} correct
                      </p>
                      <p className="text-xs text-slate-500">
                        Started {formatDate(run.startedAt)} · {run.completedAt ? `Completed ${formatDate(run.completedAt)}` : "In progress"}
                      </p>
                    </div>
                    {run.learningReportSnapshot ? (
                      <Link className="btn-secondary" href={`/org/reports/${run.learningReportSnapshot.id}`}>
                        View Report
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-600">This student has not started any organization-linked practice runs yet.</p>
        )}
      </section>
    </main>
  );
}
