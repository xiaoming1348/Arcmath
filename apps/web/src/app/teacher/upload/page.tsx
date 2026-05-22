import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canTeach, getActiveOrganizationMembership } from "@/lib/organizations";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import { Eyebrow, Section } from "@/components/ui";
import { TeacherUploadPanel } from "./upload-panel";

/**
 * Teacher upload surface. Accepts a teacher-v1 JSON payload, previews
 * it, and on commit stamps the resulting ProblemSet as ORG_ONLY under
 * the teacher's school. Optionally auto-assigns to a class in the same
 * flow.
 *
 * UI v3: lighter hero (no math glyphs — this is a transactional page,
 * not a marketing one) but consistent type hierarchy with /teacher.
 */
export default async function TeacherUploadPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fteacher%2Fupload");
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

  return (
    <main className="motion-rise">
      <Section tight className="pt-4 md:pt-6">
        <div className="flex flex-col gap-4">
          <Eyebrow>{membership.organizationName}</Eyebrow>
          <h1
            className="display-headline"
            style={{ fontSize: "clamp(1.75rem, 3.4vw, 2.5rem)" }}
          >
            {t("teacher.upload.title")}
          </h1>
          <p className="display-lede">{t("teacher.upload.subtitle")}</p>
          <div className="pt-1">
            <Link href="/teacher" className="btn-secondary">
              ← {t("teacher.class.back_to_teacher")}
            </Link>
          </div>
        </div>
      </Section>

      <Section tight>
        <TeacherUploadPanel locale={locale} />
      </Section>
    </main>
  );
}
