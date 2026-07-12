import Link from "next/link";
import { getServerSession } from "next-auth";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import {
  canTeach,
  getActiveOrganizationMembership
} from "@/lib/organizations";
import {
  DEFAULT_RESEARCH_PROFILE,
  buildResearchProgram
} from "@/lib/research-program";
import { Eyebrow, Section } from "@/components/ui";
import { resolveLocale } from "@/i18n/server";
import { ResearchWorkspacePanel } from "./research-workspace-panel";

const COPY = {
  en: {
    eyebrow: "MathScout internal lab",
    title: "Research program workspace",
    lede:
      "Plan cohorts, select targets, map weekly gates, and keep Lean/Python verification artifacts separate from exploratory evidence.",
    preview: "Preview mode",
    internal: "Internal workspace",
    signedIn: "Signed-in preview",
    guide: "Open guide",
    prep: "Teacher prep"
  },
  zh: {
    eyebrow: "MathScout 内部实验室",
    title: "研究项目工作台",
    lede:
      "规划班级研究项目、选择题目、安排每周关卡，并把 Lean/Python 验证产出与实验性证据分开记录。",
    preview: "预览模式",
    internal: "内部工作台",
    signedIn: "登录预览",
    guide: "打开指南",
    prep: "教师备课"
  }
} as const;

export default async function ResearchWorkspacePage() {
  const locale = await resolveLocale();
  const copy = COPY[locale];
  const session = await getServerSession(authOptions);
  const membership = session?.user?.id
    ? await getActiveOrganizationMembership(prisma, session.user.id)
    : null;
  const canOperate = membership ? canTeach(membership.role) : false;
  const accessLabel = canOperate
    ? copy.internal
    : session?.user
      ? copy.signedIn
      : copy.preview;

  return (
    <main className="motion-rise public-tech-page research-mode-page research-lab-page">
      <Section tight className="pt-5 md:pt-7">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="flex flex-col gap-4">
            <Eyebrow>{copy.eyebrow}</Eyebrow>
            <h1
              className="display-headline"
              style={{ fontSize: "clamp(1.9rem, 3.8vw, 3rem)" }}
            >
              {copy.title}
            </h1>
            <p className="display-lede">{copy.lede}</p>
          </div>
          <div className="surface-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="badge">{accessLabel}</span>
              {membership ? (
                <span className="info-pill">
                  {membership.organizationName} · {membership.role}
                </span>
              ) : (
                <span className="info-pill">Guest</span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/research-program" className="btn-secondary">
                {copy.guide}
              </Link>
              <Link href={canOperate ? "/teacher/prep" : "/login?callbackUrl=%2Fresearch-program%2Fworkspace"} className="btn-primary">
                {canOperate ? copy.prep : "Log in"}
              </Link>
            </div>
          </div>
        </div>
      </Section>

      <Section tight>
        <ResearchWorkspacePanel
          accessLabel={accessLabel}
          canOperate={canOperate}
          initialPlan={buildResearchProgram(DEFAULT_RESEARCH_PROFILE)}
          locale={locale}
          organizationName={membership?.organizationName ?? null}
        />
      </Section>
    </main>
  );
}
