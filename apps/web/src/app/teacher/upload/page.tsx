import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canTeach, getActiveOrganizationMembership } from "@/lib/organizations";
import { resolveLocale } from "@/i18n/server";
import { translator } from "@/i18n/client";
import { TeacherUploadPanel } from "./upload-panel";

/**
 * Teacher upload surface. Accepts a teacher-v1 JSON payload, previews it,
 * and on commit stamps the resulting ProblemSet as ORG_ONLY under the
 * teacher's school. Optionally auto-assigns to a class in the same flow.
 *
 * The heavy lifting (preprocessing queue polling, preview schema display)
 * lives in the client panel — this file is just the shell.
 */
export default async function TeacherUploadPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fteacher%2Fupload");
  }
  const membership = await getActiveOrganizationMembership(prisma, session.user.id);
  if (!membership || !canTeach(membership.role)) {
    redirect("/dashboard");
  }

  const locale = await resolveLocale();
  const t = translator(locale);

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-2">
        <span className="badge">{membership.organizationName}</span>
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("teacher.upload.title")}
        </h1>
        <p className="text-sm text-slate-600">
          {t("teacher.upload.subtitle")}
        </p>
        <div className="pt-2">
          <Link href="/teacher" className="btn-secondary">
            {t("teacher.class.back_to_teacher")}
          </Link>
        </div>
      </section>

      <TeacherUploadPanel locale={locale} />
    </main>
  );
}
