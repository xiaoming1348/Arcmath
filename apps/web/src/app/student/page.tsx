import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { resolveLocale } from "@/i18n/server";
import { translator } from "@/i18n/client";
import { StudentHomePanel } from "./student-home-panel";

/**
 * Student home. Server-gates auth (student must be logged in), resolves
 * locale once, then hands off to the client panel which pulls class +
 * assignment data via tRPC. Joining a class happens here too — we don't
 * redirect new students to a separate /join flow because a fresh student
 * typically lands here confused ("what do I do next?") and the join
 * form should be right in front of them if they have no classes yet.
 */
export default async function StudentHomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fstudent");
  }
  const locale = await resolveLocale();
  const t = translator(locale);

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-2">
        <span className="badge">{t("common.app_name")}</span>
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("student.home.title")}
        </h1>
        <p className="text-sm text-slate-600">{t("student.home.subtitle")}</p>
        <div className="pt-2">
          <Link href="/dashboard" className="btn-secondary">
            {t("topnav.home")}
          </Link>
        </div>
      </section>
      <StudentHomePanel />
    </main>
  );
}
