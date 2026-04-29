import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canTeach, getActiveOrganizationMembership } from "@/lib/organizations";
import { resolveLocale } from "@/i18n/server";
import { translator } from "@/i18n/client";
import { ClassDetail } from "./class-detail";

type PageProps = {
  params: Promise<{ classId: string }>;
};

export default async function TeacherClassDetailPage({ params }: PageProps) {
  const { classId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/login?callbackUrl=%2Fteacher%2Fclasses%2F${encodeURIComponent(classId)}`);
  }
  const membership = await getActiveOrganizationMembership(prisma, session.user.id);
  if (!membership || !canTeach(membership.role)) {
    redirect("/dashboard");
  }

  const locale = await resolveLocale();
  const t = translator(locale);

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="badge">{membership.organizationName}</span>
        </div>
        <Link href="/teacher" className="btn-secondary">
          {t("teacher.class.back_to_teacher")}
        </Link>
      </section>

      <ClassDetail classId={classId} locale={locale} />
    </main>
  );
}
