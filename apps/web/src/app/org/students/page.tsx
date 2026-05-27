import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canTeach, getActiveOrganizationMembership } from "@/lib/organizations";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import { Card, Eyebrow, Section, Tag } from "@/components/ui";
import { ClassFilter } from "@/components/class-filter";

type OrgStudentsPageProps = {
  searchParams: Promise<{
    classId?: string;
  }>;
};

/**
 * /org/students — Phase C-4 MVP teacher roster.
 *
 * Lists every STUDENT membership in the teacher's organization with
 * the small set of vitals a teacher uses for triage:
 *   - Name + email
 *   - Total attempts (lifetime, across all org practice runs)
 *   - Accuracy (correct ÷ attempted)
 *   - Last activity timestamp (created or submitted, whichever is later)
 *   - Quick link into the per-student detail page
 *
 * Filter by class: an optional `?classId=...` URL param narrows the
 * roster to students enrolled in that class. Unknown classIds (cross-
 * tenant or stale) are silently dropped — we only honour ids that
 * belong to this teacher's org. When the org has 0 classes the
 * dropdown is suppressed entirely.
 *
 * Deliberately NOT included in this MVP:
 *   - Parent invite flow (separate roadmap item)
 *   - Bulk export (CSV) — teachers asked for screen, not file
 *
 * Access: TEACHER role and above. Pure students hit a redirect to /org.
 *
 * Performance: roster + attempt counts in 2 queries (one membership
 * query, one groupBy on ProblemAttempt). For pilot orgs (≤ 60
 * students) this is comfortably sub-100ms. If a future org has 500+
 * students we can paginate or move to a materialised view.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OrganizationStudentsPage({
  searchParams
}: OrgStudentsPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Forg%2Fstudents");
  }

  const membership = await getActiveOrganizationMembership(prisma, session.user.id);
  if (!membership || !canTeach(membership.role)) {
    redirect("/org");
  }

  const uiLocale = await resolveLocale();
  const t = translator(uiLocale);

  const { classId: rawClassId } = await searchParams;
  // We pull this org's classes regardless so we can validate the
  // requested classId belongs to the org (don't let cross-tenant
  // ids leak filter state) and render the dropdown options.
  const orgClasses = await prisma.class.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });
  const selectedClassId = orgClasses.some((c) => c.id === rawClassId)
    ? (rawClassId as string)
    : null;

  // Pull every active STUDENT membership in this teacher's org. We
  // intentionally exclude pending/invited rows — the teacher wants to
  // see active learners, not the invite queue (that's the membership
  // admin page's job). When a class filter is active we narrow to
  // students enrolled in that class.
  const studentMemberships = await prisma.organizationMembership.findMany({
    where: {
      organizationId: membership.organizationId,
      role: "STUDENT",
      status: "ACTIVE",
      ...(selectedClassId
        ? { user: { enrollments: { some: { classId: selectedClassId } } } }
        : {})
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      role: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  const studentIds = studentMemberships.map((m) => m.user.id);

  // Batch one aggregate per student. groupBy avoids N+1.
  // We compute totals across SUBMITTED attempts only — a DRAFT row
  // represents a session in progress and shouldn't show as "they
  // tried this many problems" yet.
  const aggregates =
    studentIds.length > 0
      ? await prisma.problemAttempt.groupBy({
          by: ["userId"],
          where: {
            userId: { in: studentIds },
            status: "SUBMITTED"
          },
          _count: { _all: true },
          _sum: { hintsUsedCount: true },
          _max: { submittedAt: true }
        })
      : [];

  // groupBy doesn't give us a correct count — we need to count rows
  // where isCorrect = true separately. Do it in a second batch query
  // (still O(students) but only one round-trip).
  const correctAggregates =
    studentIds.length > 0
      ? await prisma.problemAttempt.groupBy({
          by: ["userId"],
          where: {
            userId: { in: studentIds },
            status: "SUBMITTED",
            isCorrect: true
          },
          _count: { _all: true }
        })
      : [];

  // Build a lookup so the JSX is clean.
  const statsByUserId = new Map<
    string,
    {
      attempts: number;
      correct: number;
      lastActivity: Date | null;
    }
  >();
  for (const a of aggregates) {
    statsByUserId.set(a.userId, {
      attempts: a._count._all,
      correct: 0, // backfilled below
      lastActivity: a._max.submittedAt ?? null
    });
  }
  for (const c of correctAggregates) {
    const cur = statsByUserId.get(c.userId);
    if (cur) cur.correct = c._count._all;
  }

  function formatLastActive(d: Date | null): string {
    if (!d) return t("org.students.last_active_never");
    const days = Math.floor(
      (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days === 0) return t("org.students.last_active_today");
    if (days === 1) return t("org.students.last_active_yesterday");
    if (days < 7)
      return t("org.students.last_active_days_ago", { n: String(days) });
    return d.toLocaleDateString(uiLocale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  // Pre-sort: most recently active first. Students who never started
  // show up at the bottom (lastActivity null) so the "active list"
  // dominates the top of the screen.
  const rows = studentMemberships
    .map((m) => {
      const s = statsByUserId.get(m.user.id) ?? {
        attempts: 0,
        correct: 0,
        lastActivity: null
      };
      return {
        user: m.user,
        joinedAt: m.createdAt,
        ...s,
        accuracy: s.attempts > 0 ? Math.round((s.correct / s.attempts) * 100) : null
      };
    })
    .sort((a, b) => {
      // null lastActivity → push to end.
      const ta = a.lastActivity ? a.lastActivity.getTime() : -Infinity;
      const tb = b.lastActivity ? b.lastActivity.getTime() : -Infinity;
      return tb - ta;
    });

  return (
    <main className="motion-rise space-y-4">
      <Section className="pt-6">
        <div className="hero-panel space-y-3">
          <Eyebrow>{t("org.students.eyebrow")}</Eyebrow>
          <h1
            className="display-headline"
            style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)" }}
          >
            {t("org.students.title")}
          </h1>
          <p className="display-lede">
            {t("org.students.subtitle", { n: String(studentMemberships.length) })}
          </p>
          <div className="pt-1 flex flex-wrap items-center gap-3">
            <Link href="/org" className="btn-secondary">
              {t("org.students.back_to_org")}
            </Link>
            {orgClasses.length > 0 ? (
              <ClassFilter
                classes={orgClasses}
                selectedClassId={selectedClassId}
                labels={{
                  label: t("org.students.filter_class_label"),
                  all: t("org.students.filter_all_classes")
                }}
              />
            ) : null}
            {/* Plain <a> (not next/link): we want a hard navigation so
                the browser triggers the file download dialog instead of
                Next router-pushing the API route as a page. */}
            <a
              href={
                selectedClassId
                  ? `/api/org/students/export?classId=${encodeURIComponent(selectedClassId)}`
                  : "/api/org/students/export"
              }
              className="btn-secondary inline-flex items-center gap-2"
              download
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M7 1.5v8M3.5 6.5L7 10l3.5-3.5M2 12h10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t("org.students.export_csv")}
            </a>
          </div>
        </div>
      </Section>

      <Section>
        <Card className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {t("org.students.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "var(--subtle)" }}>
                    <th className="py-2 text-left text-[11px] font-semibold uppercase">
                      {t("org.students.col_name")}
                    </th>
                    <th className="py-2 text-right text-[11px] font-semibold uppercase">
                      {t("org.students.col_attempts")}
                    </th>
                    <th className="py-2 text-right text-[11px] font-semibold uppercase">
                      {t("org.students.col_accuracy")}
                    </th>
                    <th className="py-2 text-right text-[11px] font-semibold uppercase">
                      {t("org.students.col_last_active")}
                    </th>
                    <th className="py-2 text-right text-[11px] font-semibold uppercase">
                      &nbsp;
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.user.id}
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      <td className="py-3">
                        <div className="font-medium" style={{ color: "var(--foreground)" }}>
                          {r.user.name ?? r.user.email}
                        </div>
                        {r.user.name ? (
                          <div className="text-xs" style={{ color: "var(--muted)" }}>
                            {r.user.email}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 text-right" style={{ color: "var(--foreground)" }}>
                        {r.attempts}
                      </td>
                      <td className="py-3 text-right">
                        {r.accuracy === null ? (
                          <span className="text-xs" style={{ color: "var(--subtle)" }}>
                            —
                          </span>
                        ) : (
                          <Tag
                            status={
                              r.accuracy >= 70
                                ? "verified"
                                : r.accuracy >= 50
                                  ? "uncertain"
                                  : "invalid"
                            }
                          >
                            {r.accuracy}%
                          </Tag>
                        )}
                      </td>
                      <td className="py-3 text-right" style={{ color: "var(--muted)" }}>
                        {formatLastActive(r.lastActivity)}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/org/students/${r.user.id}`}
                          className="btn-secondary"
                        >
                          {t("org.students.row_view")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Section>
    </main>
  );
}
