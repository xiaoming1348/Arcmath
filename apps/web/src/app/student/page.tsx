import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import { Eyebrow, Section } from "@/components/ui";
import { MathGlyphs } from "@/components/marketing/math-glyphs";
import { StudentHomePanel } from "./student-home-panel";

/**
 * Student home — pilot-critical entry surface.
 *
 * Server-gates auth, resolves locale once, then hands off to the client
 * panel which pulls class + assignment data via tRPC. Joining a class
 * happens inside the panel — we don't redirect new students to a
 * separate /join flow because a fresh student typically lands here
 * confused ("what do I do next?") and the join form should be right in
 * front of them if they have no classes yet.
 *
 * UI v3 (2026-05-13): replaces the small "surface-card with badge" hero
 * with a real hero-panel that mirrors the marketing landing's wow
 * moment — florid italic accent on the student's name, soft math-glyph
 * background. Communicates "this is your workspace" before the panel
 * data loads.
 */
export default async function StudentHomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fstudent");
  }
  const locale = await resolveLocale();
  const t = translator(locale);
  const displayName =
    session.user.name ?? session.user.email?.split("@")[0] ?? "";

  return (
    <main className="motion-rise">
      <Section tight className="pt-4 md:pt-6">
        <div className="hero-panel">
          <MathGlyphs />
          <div className="relative flex flex-col gap-5">
            <Eyebrow>{t("common.app_name")}</Eyebrow>
            <h1
              className="display-headline"
              style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
            >
              {displayName ? (
                <>
                  <span className="florid florid-gradient">{displayName}</span>
                  {locale === "zh" ? "，" : ", "}
                  {t("student.home.title")}
                </>
              ) : (
                t("student.home.title")
              )}
            </h1>
            <p className="display-lede">{t("student.home.subtitle")}</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href="/problems" className="btn-primary">
                {t("topnav.problems")}
              </Link>
              <Link href="/dashboard" className="btn-secondary">
                {t("topnav.home")}
              </Link>
            </div>
          </div>
        </div>
      </Section>

      <Section tight>
        <StudentHomePanel />
      </Section>
    </main>
  );
}
