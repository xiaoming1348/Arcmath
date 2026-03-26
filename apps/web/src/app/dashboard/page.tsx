import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@arcmath/db";
import { canManageOrganization, getActiveOrganizationMembership } from "@/lib/organizations";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fdashboard");
  }

  const displayName = session.user.name ?? session.user.email?.split("@")[0] ?? "there";
  const organizationMembership = await getActiveOrganizationMembership(prisma, session.user.id);
  const isOrganizationManager = organizationMembership ? canManageOrganization(organizationMembership.role) : false;

  if (organizationMembership && isOrganizationManager) {
    const organization = await prisma.organization.findUnique({
      where: {
        id: organizationMembership.organizationId
      },
      select: {
        name: true,
        trialEndsAt: true,
        maxAdminSeats: true,
        maxStudentSeats: true,
        memberships: {
          where: {
            status: "ACTIVE"
          },
          select: {
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        practiceRuns: {
          orderBy: {
            startedAt: "desc"
          },
          take: 8,
          select: {
            id: true,
            startedAt: true,
            completedAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            problemSet: {
              select: {
                title: true
              }
            },
            learningReportSnapshot: {
              select: {
                id: true
              }
            }
          }
        },
        learningReportSnapshots: {
          orderBy: {
            generatedAt: "desc"
          },
          take: 8,
          select: {
            id: true,
            generatedAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
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
        }
      }
    });

    if (!organization) {
      redirect("/org");
    }

    const activeAdminCount = organization.memberships.filter((item) => item.role === "OWNER" || item.role === "ADMIN").length;
    const activeStudentCount = organization.memberships.filter((item) => item.role === "STUDENT").length;

    return (
      <main className="motion-rise space-y-4 md:space-y-6">
        <section className="hero-panel">
          <div className="relative grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-end">
            <div>
              <span className="kicker">Organization Dashboard</span>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white">
                {organization.name} is ready for review.
              </h1>
              <p className="mt-4 max-w-2xl text-sm md:text-base">
                Use this workspace to monitor student practice, open saved reports, and keep the trial organization moving
                without dropping into the student solving flow.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link className="btn-primary" href="/org">
                  Open Organization Workspace
                </Link>
                <Link className="btn-secondary border-white/20 bg-white/10 text-white hover:bg-white/20" href="/assignments">
                  Open Assignments
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="hero-stat">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/70">Admin Seats</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                  {activeAdminCount}/{organization.maxAdminSeats}
                </p>
                <p className="mt-2 text-sm">Owner and admin seats are counted together in the current trial.</p>
              </div>
              <div className="hero-stat">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/70">Student Seats</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                  {activeStudentCount}/{organization.maxStudentSeats}
                </p>
                <p className="mt-2 text-sm">Watch seat usage as you add students to the trial.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="stat-card">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recent Runs</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{organization.practiceRuns.length}</p>
            <p className="mt-2 text-sm text-slate-700">Most recent student attempts linked to this organization.</p>
          </div>
          <div className="stat-card">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Saved Reports</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{organization.learningReportSnapshots.length}</p>
            <p className="mt-2 text-sm text-slate-700">Run-scoped report snapshots available for admin review.</p>
          </div>
          <div className="stat-card">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Trial Status</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">Active</p>
            <p className="mt-2 text-sm text-slate-700">
              Trial ends {organization.trialEndsAt ? organization.trialEndsAt.toLocaleDateString("en-US") : "later"}.
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="surface-card space-y-4">
            <div>
              <span className="badge">Student Activity</span>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-900">Recent practice runs</h2>
            </div>
            <div className="space-y-3">
              {organization.practiceRuns.length > 0 ? (
                organization.practiceRuns.map((run) => (
                  <div key={run.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{run.problemSet.title}</p>
                        <p className="text-sm text-slate-600">{run.user.name ?? run.user.email}</p>
                        <p className="text-xs text-slate-500">
                          {run.completedAt ? "Completed" : "In progress"} · {run.startedAt.toLocaleString("en-US")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link className="btn-secondary" href={`/org/students/${encodeURIComponent(run.user.id)}`}>
                          Student Detail
                        </Link>
                        {run.learningReportSnapshot ? (
                          <Link className="btn-secondary" href={`/org/reports/${run.learningReportSnapshot.id}`}>
                            Report
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">No organization-linked runs yet.</p>
              )}
            </div>
          </div>

          <section className="surface-card space-y-4">
            <div>
              <span className="badge">Review Queue</span>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-900">Recent report snapshots</h2>
            </div>
            <div className="space-y-3">
              {organization.learningReportSnapshots.length > 0 ? (
                organization.learningReportSnapshots.map((snapshot) => (
                  <div key={snapshot.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="space-y-2">
                      <p className="font-medium text-slate-900">{snapshot.practiceRun.problemSet.title}</p>
                      <p className="text-sm text-slate-600">{snapshot.user.name ?? snapshot.user.email}</p>
                      <p className="text-xs text-slate-500">Generated {snapshot.generatedAt.toLocaleString("en-US")}</p>
                      <div className="flex flex-wrap gap-2">
                        <Link className="btn-secondary" href={`/org/reports/${snapshot.id}`}>
                          Open Snapshot
                        </Link>
                        <Link className="btn-secondary" href={`/org/students/${encodeURIComponent(snapshot.user.id)}`}>
                          Student Detail
                        </Link>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">No saved report snapshots yet.</p>
              )}
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="motion-rise space-y-4 md:space-y-6">
      <section className="hero-panel">
        <div className="relative grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-end">
          <div>
            <span className="kicker">Dashboard</span>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white">
              Welcome back, {displayName}. Keep the momentum going.
            </h1>
            <p className="mt-4 max-w-2xl text-sm md:text-base">
              ArcMath is built to make serious math practice feel more structured and less overwhelming. Everything here
              is designed to help students stay consistent and help families see meaningful progress.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="btn-primary" href="/problems">
                Start Practicing
              </Link>
              <Link
                className="btn-secondary border-white/20 bg-white/10 text-white hover:bg-white/20"
                href={organizationMembership ? "/assignments" : "/reports"}
              >
                {organizationMembership ? "View Assignments" : "View Reports"}
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="hero-stat">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/70">Daily Rhythm</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">Steady</p>
              <p className="mt-2 text-sm">Short, focused sessions build confidence faster than crowded study plans.</p>
            </div>
            <div className="hero-stat">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/70">Long-Term Goal</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">Growth</p>
              <p className="mt-2 text-sm">Better habits, clearer feedback, and stronger problem-solving over time.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Focused Practice</p>
              <p className="mt-3 text-sm text-slate-700">Choose meaningful work instead of bouncing between disconnected tools.</p>
            </div>
        <div className="stat-card">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Clear Progress</p>
          <p className="mt-3 text-sm text-slate-700">See the next step quickly and keep learning sessions moving with confidence.</p>
        </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Family Visibility</p>
              <p className="mt-3 text-sm text-slate-700">Parents and coaches can follow along without digging through noise.</p>
            </div>
          </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="surface-card space-y-5">
          <div>
            <span className="kicker">Why Students Stay With It</span>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-900">
              Serious learning feels better when the path is clear.
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-600">
              ArcMath is meant to reduce friction around good study habits. Instead of wondering what to do next,
              students can move straight into practice, and families can see how that work is building over time.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Practice With Intent</p>
              <p className="mt-3 text-sm text-slate-700">
                Build confidence through curated problem sets rather than random question hunting.
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Stay On Track</p>
              <p className="mt-3 text-sm text-slate-700">
                Clear next steps and clean reports keep the next action obvious.
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Use Help Wisely</p>
              <p className="mt-3 text-sm text-slate-700">
                Guided support encourages persistence instead of handing over answers too quickly.
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">See Real Progress</p>
              <p className="mt-3 text-sm text-slate-700">
                Reports and review pages make improvement feel visible, not abstract.
              </p>
            </div>
          </div>
        </div>

        <section className="surface-card space-y-4">
          <div>
            <span className="badge">Start Here</span>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-900">Choose your next move</h2>
            <p className="mt-2 text-sm text-slate-600">
              Whether today is for fresh practice, review, or planning, the main areas are ready to open.
            </p>
          </div>

          <div className="grid gap-3">
            <Link className="stat-card transition hover:-translate-y-0.5" href="/problems">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Problems</p>
              <p className="mt-2 text-base font-semibold text-slate-900">Explore curated contest practice</p>
              <p className="mt-2 text-sm text-slate-600">Browse sets, start a session, and keep your solving rhythm strong.</p>
            </Link>
            <Link
              className="stat-card transition hover:-translate-y-0.5"
              href={organizationMembership ? "/assignments" : "/reports"}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {organizationMembership ? "Assignments" : "Reports"}
              </p>
              <p className="mt-2 text-base font-semibold text-slate-900">
                {organizationMembership ? "Review organization work" : "Track learning with more clarity"}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {organizationMembership
                  ? "Open the internal assignment board and see what your organization expects next."
                  : "Turn effort into something visible for students, parents, and coaches."}
              </p>
            </Link>
            {!organizationMembership ? (
              <Link className="stat-card transition hover:-translate-y-0.5" href="/membership">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Membership</p>
                <p className="mt-2 text-base font-semibold text-slate-900">Unlock reviewed real contest sets</p>
                <p className="mt-2 text-sm text-slate-600">Move from diagnostics into paid real-set practice when you are ready.</p>
              </Link>
            ) : (
              <Link className="stat-card transition hover:-translate-y-0.5" href="/resources">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resources</p>
                <p className="mt-2 text-base font-semibold text-slate-900">Open organization study materials</p>
                <p className="mt-2 text-sm text-slate-600">Use the shared notes, links, and lesson material posted inside your organization.</p>
              </Link>
            )}
            {organizationMembership ? (
              <Link className="stat-card transition hover:-translate-y-0.5" href="/org">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Organization</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{organizationMembership.organizationName}</p>
                <p className="mt-2 text-sm text-slate-600">
                  Open the organization workspace to review members, runs, and saved report snapshots.
                </p>
              </Link>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
