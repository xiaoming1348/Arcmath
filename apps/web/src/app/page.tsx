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
import {
  Card,
  Eyebrow,
  Metric,
  Section,
  SectionHeader
} from "@/components/ui";
import { MathGlyphs } from "@/components/marketing/math-glyphs";
import { OcrDemo } from "@/components/marketing/ocr-demo";
import { GradingDemo } from "@/components/marketing/grading-demo";
import { HintDemo } from "@/components/marketing/hint-demo";
import { ReportDemo } from "@/components/marketing/report-demo";
import { RouteProgressLink } from "@/components/route-progress-link";

/**
 * Marketing landing — refreshed (2026-05-13) toward Apple/Stripe
 * educational style: white surface, large typography, generous
 * vertical rhythm, single accent color, no flashy gradients.
 *
 * Authenticated users with an org membership are still redirected to
 * their role-specific home; this page only shows to evaluating users.
 */
export default async function Home() {
  const locale = await resolveLocale();
  const t = translator(locale);
  const session = await getServerSession(authOptions);
  const isLoggedIn = Boolean(session?.user);

  if (session?.user?.id) {
    const membership = await getActiveOrganizationMembership(
      prisma,
      session.user.id
    );
    if (membership) {
      if (canManageOrganization(membership.role)) redirect("/org");
      if (canTeach(membership.role)) redirect("/teacher");
      if (membership.role === "STUDENT") redirect("/student");
    }
  }

  const heroStats = [
    {
      label: t("home.stats.practice_label"),
      value: t("home.stats.practice_value"),
      description: t("home.stats.practice_desc")
    },
    {
      label: t("home.stats.verification_label"),
      value: t("home.stats.verification_value"),
      description: t("home.stats.verification_desc")
    },
    {
      label: t("home.stats.library_label"),
      value: t("home.stats.library_value"),
      description: t("home.stats.library_desc")
    }
  ];

  const platformCards = [
    {
      title: t("home.platform.admin_title"),
      meta: t("home.platform.admin_meta"),
      body: t("home.platform.admin_body"),
      tile: "tile tile-indigo"
    },
    {
      title: t("home.platform.material_title"),
      meta: t("home.platform.material_meta"),
      body: t("home.platform.material_body"),
      tile: "tile tile-amber"
    },
    {
      title: t("home.platform.student_title"),
      meta: t("home.platform.student_meta"),
      body: t("home.platform.student_body"),
      tile: "tile tile-teal"
    },
    {
      title: t("home.platform.gradebook_title"),
      meta: t("home.platform.gradebook_meta"),
      body: t("home.platform.gradebook_body"),
      tile: "tile tile-coral"
    }
  ];

  // Color-coded engine tiles — each verification engine gets its
  // own Brilliant-style saturated tile background so the trio reads
  // as a single visual statement instead of three white cards.
  const featureCards = [
    {
      title: t("home.cards.sympy_title"),
      body: t("home.cards.sympy_body"),
      tile: "tile tile-amber"
    },
    {
      title: t("home.cards.lean_title"),
      body: t("home.cards.lean_body"),
      tile: "tile tile-teal"
    },
    {
      title: t("home.cards.llm_title"),
      body: t("home.cards.llm_body"),
      tile: "tile tile-lavender"
    }
  ];

  const helpsCards = [
    { title: t("home.helps.assignments_title"), body: t("home.helps.assignments_body") },
    { title: t("home.helps.resources_title"), body: t("home.helps.resources_body") },
    { title: t("home.helps.guided_title"), body: t("home.helps.guided_body") },
    { title: t("home.helps.reports_title"), body: t("home.helps.reports_body") }
  ];

  const quickLinks = isLoggedIn
    ? [
        { href: "/dashboard", label: t("home.quickstart.link_dashboard") },
        { href: "/problems", label: t("home.quickstart.link_browse_problems") },
        { href: "/assignments", label: t("home.quickstart.link_assignments") },
        { href: "/resources", label: t("home.quickstart.link_resources") }
      ]
    : [
        { href: "/register/school", label: t("home.quickstart.link_create") },
        { href: "/for-schools", label: t("topnav.for_schools") },
        { href: "/register", label: t("home.hero.cta_student") },
        { href: "/login", label: t("home.quickstart.link_signin") }
      ];

  return (
    <main className="motion-rise">
      {/* ===========================================================
       *  HERO
       *  Wrapped in .hero-panel so a soft radial-gradient glow sits
       *  behind the headline. The first word of the headline gets a
       *  subtle 2-color brand gradient via .gradient-text to add a
       *  point of chromatic interest without going flashy.
       * ========================================================= */}
      <Section tight className="pt-6 md:pt-10">
       <div className="hero-panel">
        <MathGlyphs />
        <div className="relative grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16 lg:items-center">
          <div className="flex flex-col gap-6">
            <Eyebrow>{t("home.hero.kicker")}</Eyebrow>
            <h1
              className="display-headline"
              style={{ fontSize: "clamp(2rem, 4.5vw, 3.95rem)" }}
            >
              {/* Florid serif accent word (italic Fraunces) introduces
                  the headline with a magazine-cover wow. The brand
                  gradient fills it; the rest of the headline stays in
                  Plus Jakarta Sans 800 for contrast. */}
              <span className="florid florid-gradient" style={{ fontSize: "1.08em" }}>
                {t("home.hero.florid_word")}
              </span>{" "}
              {t("home.hero.headline")}
            </h1>
            <p className="display-lede">{t("home.hero.subhead")}</p>

            {isLoggedIn ? (
              <>
                <div className="flex flex-wrap gap-3 pt-2">
                  <RouteProgressLink className="btn-primary" href="/dashboard">
                    {t("home.hero.cta_dashboard")}
                  </RouteProgressLink>
                  <RouteProgressLink className="btn-secondary" href="/problems">
                    {t("home.hero.cta_browse_problems")}
                  </RouteProgressLink>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <span className="info-pill">{t("home.hero.pill_practice")}</span>
                  <span className="info-pill">{t("home.hero.pill_progress")}</span>
                  <span className="info-pill">{t("home.hero.pill_aesthetic")}</span>
                </div>
              </>
            ) : (
              /* ====================================================
               *  Audience split: school admin setup stays primary,
               *  with individual practice still available.
               * ================================================== */
              <div className="flex flex-col gap-4 pt-2">
                <div className="flex flex-wrap gap-3">
                  <RouteProgressLink className="btn-primary" href="/register/school">
                    {t("home.hero.cta_school")}
                  </RouteProgressLink>
                  <RouteProgressLink className="btn-secondary" href="/for-schools">
                    {t("topnav.for_schools")}
                  </RouteProgressLink>
                  <RouteProgressLink className="btn-secondary" href="/register">
                    {t("home.hero.cta_student")}
                  </RouteProgressLink>
                </div>
                <div className="hidden flex-wrap gap-2 pt-1 sm:flex">
                  <span className="info-pill">{t("home.hero.pill_practice")}</span>
                  <span className="info-pill">{t("home.hero.pill_progress")}</span>
                  <span className="info-pill">{t("home.hero.pill_aesthetic")}</span>
                </div>
              </div>
            )}
          </div>

          {/* Right-hand metric column balances the desktop hero; mobile
           * keeps the first screen focused on the primary school CTA. */}
          <div className="hidden gap-3 lg:grid">
            {heroStats.map((item) => (
              <Metric
                key={item.label}
                label={item.label}
                value={item.value}
                trend={item.description}
              />
            ))}
          </div>
        </div>
       </div>
      </Section>

      {/* ===========================================================
       *  SCHOOL WORKFLOW — role-based ToB product promise
       * ========================================================= */}
      <Section className="surface-section-warm">
        <SectionHeader
          eyebrow={t("home.platform.eyebrow")}
          title={t("home.platform.title")}
          lede={t("home.platform.lede")}
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {platformCards.map((card, index) => (
            <article key={card.title} className={card.tile}>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <span className="badge">{String(index + 1).padStart(2, "0")}</span>
                <span className="info-pill">{card.meta}</span>
              </div>
              <h3 className="mb-3">{card.title}</h3>
              <p className="text-sm" style={{ lineHeight: 1.65 }}>
                {card.body}
              </p>
            </article>
          ))}
        </div>
        <p
          className="mt-6 max-w-[78ch] text-sm"
          style={{ color: "var(--muted)", lineHeight: 1.7 }}
        >
          {t("home.platform.footer")}
        </p>
      </Section>

      {/* ===========================================================
       *  CORE PRODUCT DEMOS — animated proof points
       *
       *  Three side-by-side modules: live grading flow, progressive
       *  hint reveal, generated report. Each one auto-loops so the
       *  page feels alive without requiring interaction.
       * ========================================================= */}
      <Section className="surface-section-cool">
        <div className="grid gap-12 lg:gap-16">
          <OcrDemo
            eyebrow={t("home.demo.ocr_eyebrow")}
            title={t("home.demo.ocr_title")}
          />
          <GradingDemo
            eyebrow={t("home.demo.grading_eyebrow")}
            title={t("home.demo.grading_title")}
          />
          <HintDemo
            eyebrow={t("home.demo.hint_eyebrow")}
            title={t("home.demo.hint_title")}
          />
          <ReportDemo
            eyebrow={t("home.demo.report_eyebrow")}
            title={t("home.demo.report_title")}
          />
        </div>
      </Section>

      {/* ===========================================================
       *  VERIFICATION ENGINES — the wedge
       * ========================================================= */}
      <Section>
        <SectionHeader
          eyebrow={t("home.cards.eyebrow") || "Verification engines"}
          title={t("home.cards.headline") || "Three engines, one verdict"}
          lede={t("home.cards.lede") || "Every step is checked by deterministic math first, and only escalated to an LLM judge when the symbolic backends are unsure."}
        />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {featureCards.map((card) => (
            <div key={card.title} className={card.tile}>
              <h3 className="mb-2">{card.title}</h3>
              <p className="text-sm">{card.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ===========================================================
       *  WHAT IT HELPS WITH — warm-tinted alternating section
       * ========================================================= */}
      <Section className="surface-section-warm">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div className="flex flex-col gap-4">
            <Eyebrow>{t("home.helps.kicker")}</Eyebrow>
            <h2 className="display-headline" style={{ fontSize: "clamp(2rem, 3.6vw, 2.75rem)" }}>
              {t("home.helps.headline")}
            </h2>
            <p className="display-lede">{t("home.helps.subhead")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {helpsCards.map((card) => (
              <Card key={card.title} tight>
                <p
                  className="text-[11px] font-semibold uppercase mb-2"
                  style={{
                    color: "var(--subtle)",
                    letterSpacing: "0.12em"
                  }}
                >
                  {card.title}
                </p>
                <p className="text-sm" style={{ color: "var(--foreground)" }}>
                  {card.body}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      {/* ===========================================================
       *  QUICKSTART
       * ========================================================= */}
      <Section>
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex flex-col gap-3">
              <span className="badge">
                {isLoggedIn
                  ? t("home.quickstart.badge_member")
                  : t("home.quickstart.badge_guest")}
              </span>
              <h2 style={{ fontSize: "clamp(1.5rem, 2.6vw, 2rem)", margin: 0 }}>
                {isLoggedIn
                  ? t("home.quickstart.title_member")
                  : t("home.quickstart.title_guest")}
              </h2>
              <p className="text-sm max-w-[60ch]" style={{ color: "var(--muted)" }}>
                {isLoggedIn
                  ? t("home.quickstart.body_member")
                  : t("home.quickstart.body_guest")}
              </p>
            </div>
            <span
              className="info-pill"
              style={{ fontFamily: "var(--font-mono-custom)" }}
            >
              {isLoggedIn
                ? session?.user?.role ?? t("home.quickstart.role_member")
                : t("home.quickstart.role_guest")}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {quickLinks.map((link, index) => (
              <RouteProgressLink
                key={link.href}
                className={index === 0 ? "btn-primary" : "btn-secondary"}
                href={link.href}
              >
                {link.label}
              </RouteProgressLink>
            ))}
          </div>
        </Card>
      </Section>
    </main>
  );
}
