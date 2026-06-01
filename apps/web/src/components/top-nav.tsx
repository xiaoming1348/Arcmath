import Link from "next/link";
import type { Session } from "next-auth";
import { canAccessAdmin } from "@arcmath/shared";
import { LogoutButton } from "@/components/logout-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  canManageOrganization,
  canTeach
} from "@/lib/organizations";
import { getActiveOrganizationMembershipForNav } from "@/lib/nav-membership";
import { translatorImpl as translator, type Locale } from "@/i18n/dictionary";

type TopNavProps = {
  session: Session | null;
  locale: Locale;
};

/**
 * Top navigation — refreshed (2026-05-13) toward Apple/Stripe
 * educational style: hairline border bottom, no shadow, no
 * gradients, single accent color, lots of whitespace, type-led.
 *
 * The shape:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  Logo   ·   Nav · Nav · Nav         Lang · Account · Out│
 *   └─────────────────────────────────────────────────────────┘
 *
 * No surface-card wrapper, no blurred orbs, no double-row
 * stacking — the entire nav fits on one line on desktop and
 * wraps naturally on mobile.
 */
export async function TopNav({ session, locale }: TopNavProps) {
  const t = translator(locale);
  const isLoggedIn = Boolean(session?.user);
  const organizationMembership = session?.user
    ? await getActiveOrganizationMembershipForNav(session.user.id)
    : null;
  const isOrganizationManager = organizationMembership
    ? canManageOrganization(organizationMembership.role)
    : false;
  const isTeacher = organizationMembership
    ? canTeach(organizationMembership.role)
    : false;
  const isStudent = organizationMembership?.role === "STUDENT";
  const canSeePlatformAdmin = canAccessAdmin(session?.user?.role);

  return (
    <header
      className="motion-rise flex flex-wrap items-center justify-between gap-4 py-4"
      style={{
        borderBottom: "1px solid var(--border)"
      }}
    >
      {/* Logo — small accent mark + wordmark. No card chrome. */}
      <Link
        href="/"
        className="inline-flex items-center gap-3 transition"
      >
        <span
          className="flex h-9 w-9 items-center justify-center text-base font-bold"
          style={{
            background: "var(--action)",
            color: "var(--action-foreground)",
            borderRadius: "var(--radius-md)",
            letterSpacing: "-0.02em"
          }}
        >
          A
        </span>
        <span className="flex flex-col leading-tight">
          <span
            className="text-base font-semibold"
            style={{
              color: "var(--foreground-strong)",
              letterSpacing: "-0.02em",
              fontFamily: "var(--font-display-custom)"
            }}
          >
            {t("common.app_name")}
          </span>
          <span
            className="text-[11px] font-medium uppercase"
            style={{
              color: "var(--subtle)",
              letterSpacing: "0.14em",
              fontFamily: "var(--font-mono-custom)"
            }}
          >
            {t("topnav.tagline")}
          </span>
        </span>
      </Link>

      {/* Primary nav — slim pills, no background. */}
      <nav className="flex flex-wrap items-center gap-1">
        {!isLoggedIn ? (
          <>
            <Link href="/login" className="route-chip">
              {t("topnav.login")}
            </Link>
            <Link href="/register" className="route-chip">
              {t("topnav.register")}
            </Link>
          </>
        ) : isOrganizationManager ? (
          <>
            <Link href="/org" className="route-chip">
              {t("topnav.organization")}
            </Link>
            <Link href="/assignments" className="route-chip">
              {t("topnav.assignments")}
            </Link>
            <Link href="/resources" className="route-chip">
              {t("topnav.resources")}
            </Link>
            <Link href="/reports" className="route-chip">
              {t("topnav.reports")}
            </Link>
          </>
        ) : isTeacher ? (
          <>
            <Link href="/teacher" className="route-chip">
              {t("topnav.teacher")}
            </Link>
            <Link href="/problems" className="route-chip">
              {t("topnav.problems")}
            </Link>
            <Link href="/assignments" className="route-chip">
              {t("topnav.assignments")}
            </Link>
            <Link href="/resources" className="route-chip">
              {t("topnav.resources")}
            </Link>
            <Link href="/reports" className="route-chip">
              {t("topnav.reports")}
            </Link>
          </>
        ) : isStudent ? (
          <>
            <Link href="/student" className="route-chip">
              {t("topnav.my_work")}
            </Link>
            <Link href="/problems" className="route-chip">
              {t("topnav.problems")}
            </Link>
            {/* /me/progress = lifetime / personalized report (Phase A of
                the student-progress build). /reports stays as the
                per-set view; we keep both so users can drill in. */}
            <Link href="/me/progress" className="route-chip">
              {t("progress.nav_label")}
            </Link>
            <Link href="/reports" className="route-chip">
              {t("topnav.reports")}
            </Link>
          </>
        ) : (
          <>
            <Link href="/dashboard" className="route-chip">
              {t("topnav.dashboard")}
            </Link>
            <Link href="/problems" className="route-chip">
              {t("topnav.problems")}
            </Link>
          </>
        )}
        {canSeePlatformAdmin ? (
          <Link href="/admin" className="route-chip">
            {t("topnav.admin")}
          </Link>
        ) : null}
      </nav>

      {/* Right cluster: language + (when logged in) account + logout. */}
      <div className="flex flex-wrap items-center gap-3">
        <LanguageSwitcher />
        {isLoggedIn ? (
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="hidden text-sm md:inline hover:underline"
              style={{ color: "var(--muted)" }}
            >
              {session?.user?.email}
            </Link>
            <LogoutButton />
          </div>
        ) : null}
      </div>
    </header>
  );
}
