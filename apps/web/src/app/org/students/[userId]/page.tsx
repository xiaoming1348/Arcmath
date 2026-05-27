import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canTeach, getActiveOrganizationMembership } from "@/lib/organizations";
import {
  resolveFeedbackLocaleForUser,
  resolveLocale
} from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import {
  buildStudentProgressReport,
  type ProgressAttemptInput
} from "@/lib/ai/student-progress-report";
import { Card, Eyebrow, Section, Tag } from "@/components/ui";
import { TopicMasteryGrid } from "@/components/topic-mastery-grid";
import { ParentInviteForm } from "@/components/parent-invite-form";

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
  // Phase C-4: TEACHER role (not just OWNER/ADMIN) can view a student's
  // progress detail. Teachers don't get the "edit org" surfaces; they
  // get read-only visibility into the students they teach so they can
  // triage who needs help. Stricter gates (e.g. only show students in
  // the teacher's own classes) are a later iteration once we have
  // larger orgs — for the pilot, "same org as the teacher" is enough.
  if (!membership || !canTeach(membership.role)) {
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

  // Phase C-4: also pull lifetime attempts to compute the same
  // progress report the student sees on /me/progress. We rebuild
  // here (vs caching in the DB) because:
  //  - The Phase A/B report is ~50ms to compute even for heavy users
  //  - Teachers might check several students in rapid succession;
  //    cache invalidation on every student attempt would be more
  //    complex than just recomputing
  //  - We skip the LLM personalized plan branch (passing locale="en"
  //    with no extra opts) — the teacher doesn't need the student's
  //    motivational pep-talk, just the data
  const uiLocale = await resolveLocale();
  const feedbackLocale = await resolveFeedbackLocaleForUser(userId);
  const t = translator(uiLocale);

  const [practiceRuns, reportSnapshots, lifetimeAttempts] = await Promise.all([
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
    }),
    // Lifetime SUBMITTED attempts (across all problem sets, not just
    // org-scoped) — gives the same accuracy/topic mastery the student
    // sees themselves.
    prisma.problemAttempt.findMany({
      where: { userId, status: "SUBMITTED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        isCorrect: true,
        hintsUsedCount: true,
        createdAt: true,
        submittedAt: true,
        problem: {
          select: {
            topicKey: true,
            difficultyBand: true,
            problemSet: { select: { contest: true } }
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

  // Phase C-4: lifetime progress report, same engine /me/progress
  // uses. We pass no snapshots (so we don't accidentally trigger a
  // write from the teacher view — snapshots are owned by the student
  // page) and the student's own feedbackLocale so any LLM note is
  // rendered in the language the student would see.
  const attemptsForReport: ProgressAttemptInput[] = lifetimeAttempts.map(
    (a) => ({
      id: a.id,
      isCorrect: a.isCorrect,
      hintsUsedCount: a.hintsUsedCount,
      createdAt: a.createdAt,
      submittedAt: a.submittedAt,
      problem: {
        topicKey: a.problem.topicKey,
        difficultyBand: a.problem.difficultyBand,
        problemSet: { contest: a.problem.problemSet.contest }
      }
    })
  );
  const progressReport = await buildStudentProgressReport({
    userId,
    attempts: attemptsForReport,
    locale: feedbackLocale,
    snapshots: []
  });

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

      {/* Phase C-4: Lifetime mastery + strengths/weaknesses. Same engine
          as /me/progress but stripped to the data a teacher acts on
          (no LLM personalized plan, no recommendations carousel — the
          teacher wants triage data, not a study schedule). */}
      {progressReport.totalAttempts > 0 ? (
        <Section>
          <Card className="space-y-4">
            <Eyebrow>{t("org.students.lifetime_eyebrow")}</Eyebrow>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("org.students.lifetime_attempts")}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {progressReport.totalAttempts}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("org.students.lifetime_accuracy")}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {Math.round(progressReport.lifetimeAccuracy * 100)}%
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("org.students.lifetime_active_days")}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {progressReport.activeDaysLast14} / 14
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("org.students.lifetime_hint_reliance")}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {Math.round(progressReport.hintReliance * 100)}%
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p
                  className="text-[11px] font-semibold uppercase"
                  style={{
                    color: "var(--success)",
                    letterSpacing: "0.12em",
                    fontFamily: "var(--font-mono-custom)"
                  }}
                >
                  {t("org.students.strengths_heading")}
                </p>
                {progressReport.topStrengths.length === 0 ? (
                  <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                    {t("org.students.strengths_empty")}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {progressReport.topStrengths.slice(0, 4).map((s) => (
                      <li key={s.topicKey} className="flex justify-between gap-3">
                        <span style={{ color: "var(--foreground)" }}>{s.label}</span>
                        <Tag status="verified">{Math.round(s.accuracy * 100)}%</Tag>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p
                  className="text-[11px] font-semibold uppercase"
                  style={{
                    color: "var(--warning)",
                    letterSpacing: "0.12em",
                    fontFamily: "var(--font-mono-custom)"
                  }}
                >
                  {t("org.students.weaknesses_heading")}
                </p>
                {progressReport.topWeaknesses.length === 0 ? (
                  <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                    {t("org.students.weaknesses_empty")}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {progressReport.topWeaknesses.slice(0, 4).map((w) => (
                      <li key={w.topicKey} className="flex justify-between gap-3">
                        <span style={{ color: "var(--foreground)" }}>{w.label}</span>
                        <Tag status="invalid">{Math.round(w.accuracy * 100)}%</Tag>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        </Section>
      ) : null}

      {/* Phase C-4: mastery grid. Identical component to /me/progress
          so a teacher and student see the exact same picture, no
          "their report and mine disagree" confusion. */}
      {progressReport.topicMastery.length > 0 ? (
        <Section>
          <Card className="space-y-3">
            <Eyebrow>{t("org.students.mastery_eyebrow")}</Eyebrow>
            <h2 className="text-lg font-semibold text-slate-900">
              {t("org.students.mastery_title")}
            </h2>
            <TopicMasteryGrid
              topics={progressReport.topicMastery}
              labels={{
                levelNames: [
                  t("progress.mastery_level_0"),
                  t("progress.mastery_level_1"),
                  t("progress.mastery_level_2"),
                  t("progress.mastery_level_3"),
                  t("progress.mastery_level_4"),
                  t("progress.mastery_level_5")
                ],
                recommendation: {
                  explore: t("progress.mastery_rec_explore"),
                  review: t("progress.mastery_rec_review"),
                  progress: t("progress.mastery_rec_progress"),
                  advance: t("progress.mastery_rec_advance")
                },
                legend: t("progress.mastery_legend"),
                empty: t("progress.mastery_empty")
              }}
            />
          </Card>
        </Section>
      ) : null}

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

      <Section>
        <Card>
          <ParentInviteForm
            studentUserId={studentMembership.user.id}
            labels={{
              heading: t("org.students.parent_invite_heading"),
              helper: t("org.students.parent_invite_helper"),
              emailLabel: t("org.students.parent_invite_email_label"),
              emailPlaceholder: t("org.students.parent_invite_email_placeholder"),
              relationshipLabel: t("org.students.parent_invite_relationship_label"),
              relationshipPlaceholder: t("org.students.parent_invite_relationship_placeholder"),
              submit: t("org.students.parent_invite_submit"),
              submitting: t("org.students.parent_invite_submitting"),
              successPrefix: t("org.students.parent_invite_success"),
              invalidEmail: t("org.students.parent_invite_err_invalid_email"),
              genericError: t("org.students.parent_invite_err_generic")
            }}
          />
        </Card>
      </Section>
    </main>
  );
}
