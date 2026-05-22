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
import {
  Card,
  Eyebrow,
  Metric,
  Section,
  SectionHeader
} from "@/components/ui";
import { MathGlyphs } from "@/components/marketing/math-glyphs";
import { GradingDemo } from "@/components/marketing/grading-demo";
import { HintDemo } from "@/components/marketing/hint-demo";
import { ReportDemo } from "@/components/marketing/report-demo";

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
        { href: "/register", label: t("home.quickstart.link_create") },
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
            <h1 className="display-headline">
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
                  <Link className="btn-primary" href="/dashboard">
                    {t("home.hero.cta_dashboard")}
                  </Link>
                  <Link className="btn-secondary" href="/problems">
                    {t("home.hero.cta_browse_problems")}
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <span className="info-pill">{t("home.hero.pill_practice")}</span>
                  <span className="info-pill">{t("home.hero.pill_progress")}</span>
                  <span className="info-pill">{t("home.hero.pill_aesthetic")}</span>
                </div>
              </>
            ) : (
              /* ====================================================
               *  TWO-CTA HERO — splits the audience into the two
               *  business lines:
               *    B1: individual learner self-signup → /register
               *    B2: school admin signup → /register/school
               *  Each CTA is paired with a one-sentence tagline so
               *  the visitor can self-select without reading the
               *  rest of the page.
               * ================================================== */
              <div className="flex flex-col gap-4 pt-2">
                <div className="flex flex-wrap gap-3">
                  <Link className="btn-primary" href="/register">
                    {t("home.hero.cta_student")}
                  </Link>
                  <Link className="btn-secondary" href="/register/school">
                    {t("home.hero.cta_school")}
                  </Link>
                </div>
                <div
                  className="grid gap-3 sm:grid-cols-2"
                  style={{ maxWidth: 640 }}
                >
                  <div
                    style={{
                      borderLeft: "2px solid var(--accent-strong)",
                      paddingLeft: 12
                    }}
                  >
                    <p
                      className="text-[11px] font-semibold uppercase"
                      style={{
                        color: "var(--subtle)",
                        letterSpacing: "0.14em",
                        fontFamily: "var(--font-mono-custom)"
                      }}
                    >
                      {t("home.hero.student_label")}
                    </p>
                    <p
                      className="mt-1 text-sm"
                      style={{ color: "var(--foreground)", lineHeight: 1.5 }}
                    >
                      {t("home.hero.student_tagline")}
                    </p>
                  </div>
                  <div
                    style={{
                      borderLeft: "2px solid var(--accent-strong)",
                      paddingLeft: 12
                    }}
                  >
                    <p
                      className="text-[11px] font-semibold uppercase"
                      style={{
                        color: "var(--subtle)",
                        letterSpacing: "0.14em",
                        fontFamily: "var(--font-mono-custom)"
                      }}
                    >
                      {t("home.hero.school_label")}
                    </p>
                    <p
                      className="mt-1 text-sm"
                      style={{ color: "var(--foreground)", lineHeight: 1.5 }}
                    >
                      {t("home.hero.school_tagline")}
                    </p>
                  </div>
                </div>
                <p
                  className="text-xs pt-1"
                  style={{ color: "var(--muted)" }}
                >
                  {t("home.hero.signin_prompt")}{" "}
                  <Link
                    href="/login"
                    style={{ color: "var(--accent-strong)" }}
                    className="font-semibold"
                  >
                    {t("home.hero.signin_link")}
                  </Link>
                </p>
              </div>
            )}
          </div>

          {/* Right-hand metric column — keeps page balanced on
           *  desktop, stacks below on mobile. */}
          <div className="grid gap-3">
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
       *  CORE PRODUCT DEMOS — animated proof points
       *
       *  Three side-by-side modules: live grading flow, progressive
       *  hint reveal, generated report. Each one auto-loops so the
       *  page feels alive without requiring interaction.
       * ========================================================= */}
      <Section className="surface-section-cool">
        <div className="grid gap-12 lg:gap-16">
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
              <Link
                key={link.href}
                className={index === 0 ? "btn-primary" : "btn-secondary"}
                href={link.href}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </Card>
      </Section>
    </main>
  );
}
