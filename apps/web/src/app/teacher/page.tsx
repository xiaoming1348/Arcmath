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
import { translator } from "@/i18n/client";
import { TeacherHomePanel } from "./teacher-home-panel";

/**
 * Teacher dashboard home.
 *
 * This page is mostly a thin server shell: it checks auth, resolves the
 * teacher's school membership once (so the page 404s early if they don't
 * have one), and hands the actual interactive surface (create class,
 * invite teachers, live seat counters) to the client panel via tRPC.
 *
 * Why split this way?
 *   - Server-side gates catch logged-out / non-teacher users without a
 *     client-round-trip flash.
 *   - Everything that mutates (classes, invites) lives in tRPC so it
 *     reuses the same tenant-scoped middleware we wired up in Phase 1,
 *     instead of duplicating that logic in server actions.
 */
export default async function TeacherHomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fteacher");
  }

  const membership = await getActiveOrganizationMembership(prisma, session.user.id);
  if (!membership || !canTeach(membership.role)) {
    // Non-teachers don't get an obscure 403 — we bounce them to /dashboard
    // which is their normal home.
    redirect("/dashboard");
  }

  const locale = await resolveLocale();
  const t = translator(locale);
  const canInviteTeachers = canManageOrganization(membership.role);

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-2">
        <span className="badge">{membership.organizationName}</span>
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("teacher.home.title")}
        </h1>
        <p className="text-sm text-slate-600">{t("teacher.home.subtitle")}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href="/teacher/upload" className="btn-secondary">
            {t("teacher.upload.cta_from_home")}
          </Link>
        </div>
      </section>

      <TeacherHomePanel
        locale={locale}
        canInviteTeachers={canInviteTeachers}
      />
    </main>
  );
}
