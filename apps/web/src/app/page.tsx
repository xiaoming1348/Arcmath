import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import {
  canManageOrganization,
  canTeach,
  getActiveOrganizationMembership
} from "@/lib/organizations";

export default async function Home() {
  const locale = await resolveLocale();
  const t = translator(locale);
  const session = await getServerSession(authOptions);
  const isLoggedIn = Boolean(session?.user);

  // Once a user is logged in and has an org membership, send them to the
  // role-appropriate home instead of the marketing landing. Three lanes
  // mirror the three product surfaces: school admin → /org, teacher →
  // /teacher, student → /student. Users without an org membership stay
  // on this page (the marketing copy still applies to e.g. teachers
  // evaluating the trial).
  if (session?.user?.id) {
    const membership = await getActiveOrganizationMembership(prisma, session.user.id);
    if (membership) {
      if (canManageOrganization(membership.role)) {
        redirect("/org");
      }
      if (canTeach(membership.role)) {
        redirect("/teacher");
      }
      if (membership.role === "STUDENT") {
        redirect("/student");
      }
    }
  }

  const heroStats = [
    {
      label: t("home.stats.practice_label"),
      value: t("home.stats.practice_value"),
      description: t("home.stats.practice_desc")
    },
    {
      label: t("home.stats.parent_label"),
      value: t("home.stats.parent_value"),
      description: t("home.stats.parent_desc")
    },
    {
      label: t("home.stats.library_label"),
      value: t("home.stats.library_value"),
      description: t("home.stats.library_desc")
    }
  ];

  const featureCards = [
    { title: t("home.cards.students_title"), body: t("home.cards.students_body") },
    { title: t("home.cards.parents_title"), body: t("home.cards.parents_body") },
    { title: t("home.cards.coaches_title"), body: t("home.cards.coaches_body") }
  ];

  const quickLinks = isLoggedIn
    ? [
        { href: "/dashboard", label: t("home.quickstart.link_dashboard") },
        { href: "/problems", label: t("home.quickstart.link_browse_problems") },
        { href: "/assignments", label: t("home.quickstart.link_assignments") },
        { href: "/resources", label: t("home.quickstart.link_resources") }
      ]
    : [
        { href: "/register", label: t("home.quickstart.link_create") },
        { href: "/login", label: t("home.quickstart.link_signin") }
      ];

  return (
    <main className="motion-rise space-y-6 md:space-y-8">
      <section className="hero-panel">
        <div className="relative grid gap-8 md:grid-cols-[1.15fr_0.85fr] md:items-center">
          <div>
            <span className="kicker">{t("home.hero.kicker")}</span>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-white md:text-6xl">
              {t("home.hero.headline")}
            </h1>
            <p className="mt-5 max-w-2xl text-base md:text-lg">{t("home.hero.subhead")}</p>

            <div className="info-strip mt-6">
              <span className="info-pill border-white/10 bg-white/10 text-blue-50">
                {t("home.hero.pill_practice")}
              </span>
              <span className="info-pill border-white/10 bg-white/10 text-blue-50">
                {t("home.hero.pill_progress")}
              </span>
              <span className="info-pill border-white/10 bg-white/10 text-blue-50">
                {t("home.hero.pill_aesthetic")}
              </span>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {isLoggedIn ? (
                <>
                  <Link className="btn-primary" href="/dashboard">
                    {t("home.hero.cta_dashboard")}
                  </Link>
                  <Link
                    className="btn-secondary border-white/20 bg-white/10 text-white hover:bg-white/20"
                    href="/problems"
                  >
                    {t("home.hero.cta_browse_problems")}
                  </Link>
                </>
              ) : (
                <>
                  <Link className="btn-primary" href="/register">
                    {t("home.hero.cta_create_account")}
                  </Link>
                  <Link
                    className="btn-secondary border-white/20 bg-white/10 text-white hover:bg-white/20"
                    href="/login"
                  >
                    {t("home.hero.cta_sign_in")}
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-3">
            {heroStats.map((item) => (
              <div key={item.label} className="hero-stat">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/70">{item.label}</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">{item.value}</p>
                <p className="mt-2 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-grid">
        {featureCards.map((card, index) => (
          <div key={card.title} className="surface-card relative overflow-hidden space-y-3">
            <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-[rgba(30,102,245,0.08)] blur-3xl" />
            <span className="badge">0{index + 1}</span>
            <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-900">{card.title}</h2>
            <p className="text-sm text-slate-600">{card.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="surface-card space-y-5">
          <div className="space-y-2">
            <span className="kicker">{t("home.helps.kicker")}</span>
            <h2 className="text-3xl font-semibold tracking-[-0.05em] text-slate-900">{t("home.helps.headline")}</h2>
            <p className="max-w-2xl text-sm text-slate-600">{t("home.helps.subhead")}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t("home.helps.assignments_title")}
              </p>
              <p className="mt-3 text-sm text-slate-700">{t("home.helps.assignments_body")}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t("home.helps.resources_title")}
              </p>
              <p className="mt-3 text-sm text-slate-700">{t("home.helps.resources_body")}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t("home.helps.guided_title")}
              </p>
              <p className="mt-3 text-sm text-slate-700">{t("home.helps.guided_body")}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t("home.helps.reports_title")}
              </p>
              <p className="mt-3 text-sm text-slate-700">{t("home.helps.reports_body")}</p>
            </div>
          </div>
        </div>

        <section className="surface-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="badge">
                {isLoggedIn ? t("home.quickstart.badge_member") : t("home.quickstart.badge_guest")}
              </span>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-900">
                {isLoggedIn ? t("home.quickstart.title_member") : t("home.quickstart.title_guest")}
              </h2>
            </div>
            <div className="rounded-full border border-[rgba(16,35,60,0.08)] bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {isLoggedIn
                ? session?.user?.role ?? t("home.quickstart.role_member")
                : t("home.quickstart.role_guest")}
            </div>
          </div>

          <p className="text-sm text-slate-600">
            {isLoggedIn ? t("home.quickstart.body_member") : t("home.quickstart.body_guest")}
          </p>

          <div className="flex flex-wrap gap-3">
            {quickLinks.map((link, index) => (
              <Link key={link.href} className={index === 0 ? "btn-primary" : "btn-secondary"} href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
