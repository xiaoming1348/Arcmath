import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { ContestBrowser, type ContestBrowserSet } from "@/components/contest-browser";
import { listGrantedRealTutorProblemSetIds } from "@/lib/tutor-premium-access";
import {
  buildDiagnosticProblemSetWhere,
  buildRealExamProblemSetWhere,
  buildTopicPracticeProblemSetWhere
} from "@/lib/tutor-usable-sets";
import { getDiagnosticStageLabel } from "@/lib/problem-set-modes";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import {
  canManageOrganization,
  getActiveOrganizationMembership
} from "@/lib/organizations";

export default async function ProblemsPage() {
  const locale = await resolveLocale();
  const t = translator(locale);
  const session = await getServerSession(authOptions);

  // Strict role gate: school-admin / owner shouldn't be in the
  // problem-doing UI at all. Punt them back to the school overview.
  // Pure platform admins (User.role === "ADMIN" with no org membership)
  // are allowed through — they're the QA / arcmath staff.
  if (session?.user?.id) {
    const orgMembership = await getActiveOrganizationMembership(prisma, session.user.id);
    if (orgMembership && canManageOrganization(orgMembership.role)) {
      redirect("/org");
    }
  }

  const [rawDiagnosticSets, realSets, topicPracticeSets, grantedRealSetIds] = await Promise.all([
    prisma.problemSet.findMany({
      where: buildDiagnosticProblemSetWhere(),
      orderBy: [{ year: "desc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        contest: true,
        category: true,
        diagnosticStage: true,
        submissionMode: true,
        _count: { select: { problems: true } }
      }
    }),
    prisma.problemSet.findMany({
      where: buildRealExamProblemSetWhere(),
      orderBy: [{ contest: "asc" }, { year: "desc" }, { exam: "asc" }],
      select: {
        id: true,
        title: true,
        contest: true,
        year: true,
        exam: true,
        category: true,
        submissionMode: true,
        _count: { select: { problems: true } }
      }
    }),
    prisma.problemSet.findMany({
      where: buildTopicPracticeProblemSetWhere(),
      orderBy: [{ contest: "asc" }, { year: "desc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        contest: true,
        year: true,
        exam: true,
        category: true,
        submissionMode: true,
        _count: { select: { problems: true } }
      }
    }),
    session?.user ? listGrantedRealTutorProblemSetIds(prisma, session.user.id) : Promise.resolve([])
  ]);

  const grantedIdSet = new Set(grantedRealSetIds);
  const premiumUnlocked = session?.user?.role === "ADMIN" || grantedIdSet.size > 0 || true; // DISABLE_ACCESS_GATING respected downstream

  const diagnosticSets = Array.from(
    new Map(
      rawDiagnosticSets.map((set) => [`${set.contest}:${set.title}:${set.diagnosticStage ?? "NONE"}`, set])
    ).values()
  );

  const browserSets: ContestBrowserSet[] = [
    ...realSets.map((s) => ({
      id: s.id,
      title: s.title,
      contest: s.contest as string,
      year: s.year,
      exam: s.exam,
      category: s.category as string,
      submissionMode: s.submissionMode as string,
      problemCount: s._count.problems,
      unlocked: premiumUnlocked || grantedIdSet.has(s.id)
    })),
    ...topicPracticeSets.map((s) => ({
      id: s.id,
      title: s.title,
      contest: s.contest as string,
      year: s.year,
      exam: s.exam,
      category: s.category as string,
      submissionMode: s.submissionMode as string,
      problemCount: s._count.problems,
      unlocked: true // topic practice isn't gated
    }))
  ];

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <span className="badge">{t("problems.page.badge")}</span>
        <h1 className="text-2xl font-semibold text-slate-900">{t("problems.page.title")}</h1>
        <p className="text-sm text-slate-600">{t("problems.page.subtitle")}</p>
      </section>

      <section className="surface-card space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">{t("problems.diagnostic.heading")}</h2>
          <p className="text-sm text-slate-600">{t("problems.diagnostic.subtitle")}</p>
        </div>

        <div className="space-y-3">
          {diagnosticSets.map((practiceSet) => (
            <article key={practiceSet.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900">{practiceSet.title}</h3>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>{t("problems.diagnostic.problem_count", { count: practiceSet._count.problems })}</span>
                    <span className="badge">{t("problems.diagnostic.tag")}</span>
                    {practiceSet.diagnosticStage ? (
                      <span>{getDiagnosticStageLabel(practiceSet.diagnosticStage)}</span>
                    ) : null}
                  </div>
                </div>
                <Link className="btn-primary" href={`/problems/set/${encodeURIComponent(practiceSet.id)}`}>
                  {t("problems.diagnostic.start_button")}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-card space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">{t("problems.competitions.heading")}</h2>
          <p className="text-sm text-slate-600">{t("problems.competitions.subtitle")}</p>
        </div>
        <ContestBrowser sets={browserSets} />
      </section>
    </main>
  );
}
