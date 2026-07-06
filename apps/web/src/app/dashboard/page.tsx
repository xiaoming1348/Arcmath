import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@arcmath/db";
import {
  canManageOrganization,
  getActiveOrganizationMembership
} from "@/lib/organizations";
import {
  Card,
  EmptyState,
  Eyebrow,
  Metric,
  Section,
  SectionHeader
} from "@/components/ui";

/**
 * Dashboard — refreshed (2026-05-13) toward Apple/Stripe educational
 * style. Two top-level views:
 *
 *   - Org manager: organization metrics + recent practice runs +
 *     report snapshots. The "operations cockpit".
 *   - Everyone else (rare — most users are redirected at /): a
 *     welcome surface with the same metric tiles, calmer copy.
 *
 * Hierarchy is type-led: an eyebrow + display headline introduces
 * each section, metrics are large but spare, lists use the standard
 * Card primitive with hairline borders.
 */
export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fdashboard");
  }

  const displayName =
    session.user.name ?? session.user.email?.split("@")[0] ?? "there";
  const organizationMembership = await getActiveOrganizationMembership(
    prisma,
    session.user.id
  );
  const isOrganizationManager = organizationMembership
    ? canManageOrganization(organizationMembership.role)
    : false;

  // =====================================================================
  // Org-manager view
  // =====================================================================
  if (organizationMembership && isOrganizationManager) {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationMembership.organizationId },
      select: {
        name: true,
        trialEndsAt: true,
        maxAdminSeats: true,
        maxStudentSeats: true,
        memberships: {
          where: { status: "ACTIVE" },
          select: {
            role: true,
            user: { select: { id: true, name: true, email: true } }
          }
        },
        practiceRuns: {
          orderBy: { startedAt: "desc" },
          take: 8,
          select: {
            id: true,
            startedAt: true,
            completedAt: true,
            user: { select: { id: true, name: true, email: true } },
            problemSet: { select: { title: true } },
            learningReportSnapshot: { select: { id: true } }
          }
        },
        learningReportSnapshots: {
          orderBy: { generatedAt: "desc" },
          take: 8,
          select: {
            id: true,
            generatedAt: true,
            user: { select: { id: true, name: true, email: true } },
            practiceRun: {
              select: { problemSet: { select: { title: true } } }
            }
          }
        }
      }
    });

    if (!organization) redirect("/org");

    const activeAdminCount = organization.memberships.filter(
      (m) => m.role === "OWNER" || m.role === "ADMIN"
    ).length;
    const activeStudentCount = organization.memberships.filter(
      (m) => m.role === "STUDENT"
    ).length;

    return (
      <main className="motion-rise">
        {/* ===========================================================
         *  HERO — wrapped in a soft-glow panel so the page opens
         *  with a recognisable focal point rather than flat white.
         * ========================================================= */}
        <Section tight className="pt-6 md:pt-10">
          <div className="hero-panel">
            <div className="flex flex-col gap-6">
              <Eyebrow>Organization Dashboard</Eyebrow>
              <h1
                className="display-headline"
                style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
              >
                <span className="gradient-text">{organization.name}</span>
              </h1>
              <p className="display-lede">
                Monitor student practice, open saved reports, and keep the
                organization workspace moving without dropping into the student solving flow.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link className="btn-primary" href="/org">
                  Open Organization Workspace
                </Link>
                <Link className="btn-secondary" href="/assignments">
                  Open Assignments
                </Link>
              </div>
            </div>
          </div>
        </Section>

        {/* ===========================================================
         *  METRIC ROW — sits on a cool-tinted band so it reads as
         *  the "operational stats" chapter, distinct from the hero.
         * ========================================================= */}
        <Section tight className="surface-section-cool">
          <div className="grid gap-4 md:grid-cols-4">
            <Metric
              label="Admin seats"
              value={`${activeAdminCount}/${organization.maxAdminSeats}`}
              trend="Owner + admin combined"
            />
            <Metric
              label="Student seats"
              value={`${activeStudentCount}/${organization.maxStudentSeats}`}
              trend="Active enrolments"
            />
            <Metric
              label="Recent runs"
              value={organization.practiceRuns.length}
              trend="Last 8 student attempts"
            />
            <Metric
              label="Saved reports"
              value={organization.learningReportSnapshots.length}
              trend="Pinned learning snapshots"
            />
          </div>
        </Section>

        <hr className="divider-soft" />

        {/* ===========================================================
         *  RECENT ACTIVITY — two-column
         * ========================================================= */}
        <Section>
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="flex flex-col gap-6">
              <SectionHeader
                eyebrow="Student activity"
                title="Recent practice runs"
              />
              <div className="flex flex-col gap-3">
                {organization.practiceRuns.length > 0 ? (
                  organization.practiceRuns.map((run) => (
                    <Card key={run.id} tight>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <p className="font-medium" style={{ color: "var(--foreground)" }}>
                            {run.problemSet.title}
                          </p>
                          <p className="text-sm" style={{ color: "var(--muted)" }}>
                            {run.user.name ?? run.user.email}
                          </p>
                          <p className="text-xs" style={{ color: "var(--subtle)" }}>
                            {run.completedAt ? "Completed" : "In progress"} ·{" "}
                            {run.startedAt.toLocaleString("en-US")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className="btn-secondary"
                            href={`/org/students/${encodeURIComponent(run.user.id)}`}
                          >
                            Student
                          </Link>
                          {run.learningReportSnapshot && (
                            <Link
                              className="btn-secondary"
                              href={`/org/reports/${run.learningReportSnapshot.id}`}
                            >
                              Report
                            </Link>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <EmptyState
                      title="No runs yet"
                      description="Student practice attempts linked to this organization will appear here."
                    />
                  </Card>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <SectionHeader
                eyebrow="Review queue"
                title="Report snapshots"
              />
              <div className="flex flex-col gap-3">
                {organization.learningReportSnapshots.length > 0 ? (
                  organization.learningReportSnapshots.map((snapshot) => (
                    <Card key={snapshot.id} tight>
                      <div className="flex flex-col gap-2">
                        <p className="font-medium" style={{ color: "var(--foreground)" }}>
                          {snapshot.practiceRun.problemSet.title}
                        </p>
                        <p className="text-sm" style={{ color: "var(--muted)" }}>
                          {snapshot.user.name ?? snapshot.user.email}
                        </p>
                        <p className="text-xs" style={{ color: "var(--subtle)" }}>
                          Generated {snapshot.generatedAt.toLocaleString("en-US")}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Link
                            className="btn-secondary"
                            href={`/org/reports/${snapshot.id}`}
                          >
                            Open snapshot
                          </Link>
                          <Link
                            className="btn-secondary"
                            href={`/org/students/${encodeURIComponent(snapshot.user.id)}`}
                          >
                            Student
                          </Link>
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <EmptyState
                      title="No snapshots saved"
                      description="Saved report snapshots will surface here as runs complete."
                    />
                  </Card>
                )}
              </div>
            </div>
          </div>
        </Section>
      </main>
    );
  }

  // =====================================================================
  // Default / fallback view
  // =====================================================================
  return (
    <main className="motion-rise">
      <Section tight className="pt-6 md:pt-10">
        <div className="flex flex-col gap-6">
          <Eyebrow>Dashboard</Eyebrow>
          <h1
            className="display-headline"
            style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
          >
            Welcome back, {displayName}.
          </h1>
          <p className="display-lede">
            ArcMath is built to make serious math practice feel more
            structured and less overwhelming. Everything here is designed
            to help students stay consistent and help families see
            meaningful progress.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link className="btn-primary" href="/problems">
              Start practicing
            </Link>
            <Link
              className="btn-secondary"
              href={organizationMembership ? "/assignments" : "/reports"}
            >
              {organizationMembership ? "View assignments" : "View reports"}
            </Link>
          </div>
        </div>
      </Section>

      <hr className="divider-soft" />

      {/* ===========================================================
       *  ENGINE STACK
       * ========================================================= */}
      <Section>
        <SectionHeader
          eyebrow="Verification engines"
          title="Three engines, one verdict"
          lede="Every step you write is checked by deterministic math first. We only escalate to an LLM judge when the symbolic backends are unsure."
        />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Card>
            <h3 className="mb-2">SymPy</h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Algebraic identities and equation manipulation are checked
              in milliseconds. No LLM round-trip for &ldquo;2x = 4&rdquo;.
            </p>
          </Card>
          <Card>
            <h3 className="mb-2">Per-step trace</h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Every step shows VERIFIED / INVALID / UNCERTAIN and which
              engine signed off — SymPy, Lean kernel, or LLM judge.
            </p>
          </Card>
          <Card>
            <h3 className="mb-2">Pre-computed hints</h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Three problem-specific hints are baked into the catalog so
              students never see a generic placeholder when stuck.
            </p>
          </Card>
        </div>
      </Section>

      <hr className="divider-soft" />

      {/* ===========================================================
       *  WHY KERNEL OVER CHATBOT  +  QUICK LINKS
       * ========================================================= */}
      <Section>
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <div className="flex flex-col gap-6">
            <SectionHeader
              eyebrow="Why a kernel beats a chatbot"
              title="An LLM grading math is guessing. A kernel does not guess."
              lede="ChatGPT will tell a student their wrong proof is correct because it sounds plausible. ArcMath routes each step through SymPy or Lean first; the LLM only fills in where the formal tools cannot."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: "Practice with intent",
                  body: "Build confidence through curated problem sets, not random question hunting."
                },
                {
                  title: "Stay on track",
                  body: "Clear next steps and clean reports keep the next action obvious."
                },
                {
                  title: "Use help wisely",
                  body: "Guided support encourages persistence instead of handing over answers too quickly."
                },
                {
                  title: "See real progress",
                  body: "Reports and review pages make improvement feel visible, not abstract."
                }
              ].map((item) => (
                <Card key={item.title} tight>
                  <p
                    className="text-[11px] font-semibold uppercase mb-2"
                    style={{ color: "var(--subtle)", letterSpacing: "0.12em" }}
                  >
                    {item.title}
                  </p>
                  <p className="text-sm" style={{ color: "var(--foreground)" }}>
                    {item.body}
                  </p>
                </Card>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeader
              eyebrow="Start here"
              title="Choose your next move"
            />
            <Link
              href="/problems"
              className="surface-card transition"
              style={{ textDecoration: "none" }}
            >
              <Eyebrow>Problems</Eyebrow>
              <p
                className="mt-2 text-base font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Explore curated contest practice
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                Browse sets, start a session, and keep your rhythm strong.
              </p>
            </Link>
            <Link
              href={organizationMembership ? "/assignments" : "/reports"}
              className="surface-card transition"
              style={{ textDecoration: "none" }}
            >
              <Eyebrow>
                {organizationMembership ? "Assignments" : "Reports"}
              </Eyebrow>
              <p
                className="mt-2 text-base font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                {organizationMembership
                  ? "Review organization work"
                  : "Track learning with more clarity"}
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                {organizationMembership
                  ? "Open the internal assignment board and see what your organization expects next."
                  : "Track each step with the engine that verified it — SymPy, Lean, or LLM judge."}
              </p>
            </Link>
            {organizationMembership && (
              <>
                <Link
                  href="/resources"
                  className="surface-card transition"
                  style={{ textDecoration: "none" }}
                >
                  <Eyebrow>Resources</Eyebrow>
                  <p
                    className="mt-2 text-base font-semibold"
                    style={{ color: "var(--foreground)" }}
                  >
                    Open organization study materials
                  </p>
                  <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                    Use the shared notes, links, and lesson material posted
                    inside your organization.
                  </p>
                </Link>
                <Link
                  href="/org"
                  className="surface-card transition"
                  style={{ textDecoration: "none" }}
                >
                  <Eyebrow>Organization</Eyebrow>
                  <p
                    className="mt-2 text-base font-semibold"
                    style={{ color: "var(--foreground)" }}
                  >
                    {organizationMembership.organizationName}
                  </p>
                  <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                    Open the organization workspace to review members, runs,
                    and saved report snapshots.
                  </p>
                </Link>
              </>
            )}
          </div>
        </div>
      </Section>
    </main>
  );
}
