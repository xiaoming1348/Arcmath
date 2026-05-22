import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import {
  canManageOrganization,
  canTeach,
  getActiveOrganizationMembership
} from "@/lib/organizations";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import { Eyebrow, Section } from "@/components/ui";
import { MathGlyphs } from "@/components/marketing/math-glyphs";
import { TeacherHomePanel } from "./teacher-home-panel";

/**
 * Teacher dashboard home.
 *
 * Server-side gates filter out logged-out / non-teacher users early.
 * The interactive class-roster + invites surface is in TeacherHomePanel
 * which talks to tRPC.
 *
 * UI v3 (2026-05-13): hero updated to the same "italic-name → headline"
 * pattern the student page uses, plus a primary CTA ("upload work")
 * that lands directly on the most common teacher action.
 */
export default async function TeacherHomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fteacher");
  }

  const membership = await getActiveOrganizationMembership(
    prisma,
    session.user.id
  );
  if (!membership || !canTeach(membership.role)) {
    redirect("/dashboard");
  }

  const locale = await resolveLocale();
  const t = translator(locale);
  const canInviteTeachers = canManageOrganization(membership.role);

  return (
    <main className="motion-rise">
      <Section tight className="pt-4 md:pt-6">
        <div className="hero-panel">
          <MathGlyphs />
          <div className="relative flex flex-col gap-5">
            <Eyebrow>{membership.organizationName}</Eyebrow>
            <h1
              className="display-headline"
              style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
            >
              <span className="florid florid-gradient">
                {t("teacher.home.title")}
              </span>
            </h1>
            <p className="display-lede">{t("teacher.home.subtitle")}</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href="/teacher/upload" className="btn-primary">
                {t("teacher.upload.cta_from_home")}
              </Link>
              <Link href="/problems" className="btn-secondary">
                {t("topnav.problems")}
              </Link>
            </div>
          </div>
        </div>
      </Section>

      <Section tight>
        <TeacherHomePanel
          locale={locale}
          canInviteTeachers={canInviteTeachers}
        />
      </Section>
    </main>
  );
}
