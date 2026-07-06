import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canTeach, getActiveOrganizationMembership } from "@/lib/organizations";
import { resolveLocale } from "@/i18n/server";
import { Eyebrow, Section } from "@/components/ui";
import { TeacherPrepPanel } from "./prep-panel";

export default async function TeacherPrepPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fteacher%2Fprep");
  }

  const membership = await getActiveOrganizationMembership(
    prisma,
    session.user.id
  );
  if (!membership || !canTeach(membership.role)) {
    redirect("/dashboard");
  }

  const locale = await resolveLocale();
  const isZh = locale === "zh";

  return (
    <main className="motion-rise">
      <Section tight className="pt-4 md:pt-6">
        <div className="flex flex-col gap-4">
          <Eyebrow>{membership.organizationName}</Eyebrow>
          <h1
            className="display-headline"
            style={{ fontSize: "clamp(1.75rem, 3.4vw, 2.5rem)" }}
          >
            {isZh ? "教师备课助手" : "Teacher prep assistant"}
          </h1>
          <p className="display-lede">
            {isZh
              ? "粘贴难题、章节提纲或讲义片段，生成用于备课的关键思路、易错点和课堂追问。"
              : "Paste a difficult problem, chapter outline, or material excerpt to generate key ideas, misconceptions, and classroom prompts."}
          </p>
          <div className="pt-1">
            <Link href="/teacher" className="btn-secondary">
              {isZh ? "返回教师控制台" : "Back to teacher dashboard"}
            </Link>
          </div>
        </div>
      </Section>

      <Section tight>
        <TeacherPrepPanel locale={locale} />
      </Section>
    </main>
  );
}
