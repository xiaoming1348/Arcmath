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
import {
  getDiagnosticStageRoman,
  getDiagnosticStageTier,
  getDiagnosticStageDescription,
  getDiagnosticStageOrder
} from "@/lib/problem-set-modes";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import {
  canManageOrganization,
  getActiveOrganizationMembership
} from "@/lib/organizations";

/**
 * /problems — student-facing entry point.
 *
 * 2026-05-20 reorg: previously the page led with a 9-card flat list of
 * "Free Diagnostic Test" cards (3 contests × 3 stages), which dwarfed
 * the actual past-paper library underneath. New layout:
 *
 *   1. Header
 *   2. Placement tests — compact: one card per contest with three
 *      level buttons (I/II/III) inside. Each level gets a tooltip-
 *      style description so users can self-place.
 *   3. AMC contests (AMC 8/10/12) — past papers + topic practice
 *   4. Other competitions (AIME, USAMO, Putnam, Euclid, MAT, STEP, …)
 *
 * AMC vs non-AMC split was a direct user request — they read AMC as
 * the high-school competition track and want everything else (Olympiad,
 * UK Oxbridge, etc.) in its own surface.
 */
const AMC_CONTESTS = new Set(["AMC8", "AMC10", "AMC12"]);

const PLACEMENT_CONTEST_ORDER = ["AMC8", "AMC10", "AMC12"] as const;

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

  // De-dupe by (contest, title, stage). Seed has a unique key but we
  // keep this defensive in case a re-seed double-inserts.
  const diagnosticSets = Array.from(
    new Map(
      rawDiagnosticSets.map((set) => [`${set.contest}:${set.title}:${set.diagnosticStage ?? "NONE"}`, set])
    ).values()
  );

  // Group diagnostic sets by contest for the compact placement-card UI.
  // Within each contest we sort by stage order (EARLY → MID → LATE) so
  // the level pills always read I → II → III left-to-right.
  const diagnosticByContest = new Map<string, typeof diagnosticSets>();
  for (const ds of diagnosticSets) {
    const list = diagnosticByContest.get(ds.contest) ?? [];
    list.push(ds);
    diagnosticByContest.set(ds.contest, list);
  }
  for (const list of diagnosticByContest.values()) {
    list.sort(
      (a, b) =>
        getDiagnosticStageOrder(a.diagnosticStage) -
        getDiagnosticStageOrder(b.diagnosticStage)
    );
  }

  // Browser sets — split into AMC vs other so we can render two
  // separate sections.
  const allBrowserSets: ContestBrowserSet[] = [
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
      unlocked: true
    }))
  ];

  const amcBrowserSets = allBrowserSets.filter((s) => AMC_CONTESTS.has(s.contest));
  const otherBrowserSets = allBrowserSets.filter((s) => !AMC_CONTESTS.has(s.contest));

  return (
    <main className="motion-rise space-y-4">
      {/* === Header === */}
      <section className="surface-card space-y-3">
        <span className="badge">{t("problems.page.badge")}</span>
        <h1 className="text-2xl font-semibold text-slate-900">{t("problems.page.title")}</h1>
        <p className="text-sm text-slate-600">{t("problems.page.subtitle")}</p>
      </section>

      {/* === Placement tests (was: long flat diagnostic list) === */}
      <section className="surface-card space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("problems.placement.heading")}
          </h2>
          <p className="text-sm text-slate-600">
            {t("problems.placement.subtitle")}
          </p>
        </div>

        {/* Level legend — keep it compact, single row on desktop */}
        <div
          className="grid gap-2 text-xs sm:grid-cols-3"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: 12
          }}
        >
          <div>
            <span className="font-semibold" style={{ color: "var(--accent-strong)" }}>
              I · {t("problems.placement.tier_foundation")}
            </span>
            <p className="mt-1" style={{ color: "var(--muted)" }}>
              {t("problems.placement.level_i_desc")}
            </p>
          </div>
          <div>
            <span className="font-semibold" style={{ color: "var(--accent-strong)" }}>
              II · {t("problems.placement.tier_intermediate")}
            </span>
            <p className="mt-1" style={{ color: "var(--muted)" }}>
              {t("problems.placement.level_ii_desc")}
            </p>
          </div>
          <div>
            <span className="font-semibold" style={{ color: "var(--accent-strong)" }}>
              III · {t("problems.placement.tier_advanced")}
            </span>
            <p className="mt-1" style={{ color: "var(--muted)" }}>
              {t("problems.placement.level_iii_desc")}
            </p>
          </div>
        </div>

        {/* One card per contest. AMC8 / AMC10 / AMC12 each get 3 level
            buttons inside. Render order is fixed via PLACEMENT_CONTEST_ORDER. */}
        <div className="grid gap-3 md:grid-cols-3">
          {PLACEMENT_CONTEST_ORDER.map((contest) => {
            const sets = diagnosticByContest.get(contest) ?? [];
            if (sets.length === 0) return null;
            const contestLabel =
              contest === "AMC8"
                ? t("problems.placement.contest_amc8")
                : contest === "AMC10"
                  ? t("problems.placement.contest_amc10")
                  : t("problems.placement.contest_amc12");
            return (
              <article
                key={contest}
                className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 flex flex-col gap-3"
              >
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-slate-900">
                    {contestLabel}
                  </h3>
                  <span
                    className="text-[11px] font-semibold uppercase"
                    style={{ color: "var(--subtle)", letterSpacing: "0.12em" }}
                  >
                    {t("problems.placement.contest_subtitle")}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {sets.map((set) => {
                    const roman = getDiagnosticStageRoman(set.diagnosticStage);
                    const tier = getDiagnosticStageTier(set.diagnosticStage);
                    const desc = getDiagnosticStageDescription(set.diagnosticStage);
                    return (
                      <Link
                        key={set.id}
                        href={`/problems/set/${encodeURIComponent(set.id)}`}
                        className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-slate-400"
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold"
                          style={{
                            background: "var(--accent-strong)",
                            color: "#fff"
                          }}
                        >
                          {roman}
                        </span>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-sm font-semibold text-slate-900">
                            {tier}
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: "var(--muted)", lineHeight: 1.4 }}
                          >
                            {set._count.problems}{" "}
                            {t("problems.placement.problems_word")} ·{" "}
                            {desc?.split(".")[0] /* short summary, drop the recommendation sentence */}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* === AMC contests (8/10/12) past papers + topic practice === */}
      {amcBrowserSets.length > 0 ? (
        <section className="surface-card space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("problems.amc.heading")}
            </h2>
            <p className="text-sm text-slate-600">{t("problems.amc.subtitle")}</p>
          </div>
          <ContestBrowser sets={amcBrowserSets} />
        </section>
      ) : null}

      {/* === Other competitions (AIME / USAMO / Putnam / Euclid / MAT / STEP / …) === */}
      {otherBrowserSets.length > 0 ? (
        <section className="surface-card space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("problems.other.heading")}
            </h2>
            <p className="text-sm text-slate-600">
              {t("problems.other.subtitle")}
            </p>
          </div>
          <ContestBrowser sets={otherBrowserSets} />
        </section>
      ) : null}
    </main>
  );
}
