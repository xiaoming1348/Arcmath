import Link from "next/link";
import type { CSSProperties } from "react";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import { BrandMark } from "@/components/brand-mark";
import { Eyebrow, Section, SectionHeader } from "@/components/ui";
import { OcrDemo } from "@/components/marketing/ocr-demo";
import { GradingDemo } from "@/components/marketing/grading-demo";
import { HintDemo } from "@/components/marketing/hint-demo";
import { ReportDemo } from "@/components/marketing/report-demo";

/**
 * /for-schools — public product page for schools and tutoring orgs.
 * Keep it concrete: platform capabilities, class workflow, and verified
 * math feedback. Avoid offer/pricing copy here.
 */
export const dynamic = "force-dynamic";

export default async function ForSchoolsPage() {
  const locale = await resolveLocale();
  const t = translator(locale);
  const isZh = locale === "zh";

  const systemSignals = isZh
    ? ["机构权限", "PDF 切片", "形式化批改", "课堂报告"]
    : ["Org control", "PDF slicing", "Formal grading", "Class reports"];
  const consoleRows = isZh
    ? [
        ["材料", "PDF 第 35-36 页 · 第 3-9 题"],
        ["转化", "作业题面 · 不生成答案"],
        ["验证", "SymPy + Lean + 教师复核"],
        ["报告", "班级掌握度 · 错因聚类"]
      ]
    : [
        ["MATERIAL", "PDF p.35-36 · Problems 3-9"],
        ["TRANSFORM", "Student-ready prompt · no answer leak"],
        ["VERIFY", "SymPy + Lean + teacher review"],
        ["REPORT", "Class mastery · error clusters"]
      ];
  const brandCaption = isZh ? "ArcMath 教学 OS" : "ArcMath Teaching OS";
  const commandKicker = isZh ? "ARC 工作流" : "ARC STACK";
  const liveLabel = isZh ? "运行中" : "live";
  const contactEmail = "yimingsun@berkeley.edu";
  const proofLanes = isZh
    ? ["PDF 教材", "作业发布", "学生提交", "可信批改"]
    : ["PDF material", "Assignment", "Submission", "Verified grade"];

  return (
    <main className="school-platform-page motion-rise">
      {/* === HERO === */}
      <Section className="school-hero-section pt-6">
        <div className="school-hero">
          <div className="school-hero-copy">
            <div className="school-brand-lockup">
              <BrandMark size={54} title="ArcMath" />
              <div>
                <Eyebrow>{t("for_schools.eyebrow")}</Eyebrow>
                <p className="school-brand-caption">{brandCaption}</p>
              </div>
            </div>
            <h1 className="school-hero-title">
              {t("for_schools.hero_title")}
            </h1>
            <p className="school-hero-lede">
              {t("for_schools.hero_lede")}
            </p>
            <div className="school-signal-row" aria-label="Core platform functions">
              {systemSignals.map((signal) => (
                <span key={signal}>{signal}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={`mailto:${contactEmail}?subject=Arcmath%20school%20platform%20enquiry`}
                className="btn-primary"
              >
                {t("for_schools.cta_email")}
              </a>
              <Link href="/register/school" className="btn-secondary">
                {t("for_schools.cta_register_school")}
              </Link>
            </div>
          </div>
          <aside className="school-command-panel" aria-label="ArcMath platform workflow preview">
            <div className="school-console-top">
              <div className="flex items-center gap-3">
                <BrandMark size={40} />
                <div>
                  <p className="school-console-kicker">{commandKicker}</p>
                  <h2>{isZh ? "课堂运行中枢" : "Math class control plane"}</h2>
                </div>
              </div>
              <span className="school-live-dot">{liveLabel}</span>
            </div>

            <div className="school-system-map" aria-hidden>
              {proofLanes.map((lane, index) => (
                <div className="school-system-node" key={lane} style={{ "--node-index": index } as CSSProperties}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{lane}</strong>
                </div>
              ))}
            </div>

            <div className="school-console-rows">
              {consoleRows.map(([label, value]) => (
                <div className="school-console-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </Section>

      {/* === WHY THIS MATTERS === */}
      <Section className="school-after-hero">
        <div className="school-two-up">
          <article className="school-copy-panel">
            <Eyebrow>{t("for_schools.why_eyebrow")}</Eyebrow>
            <h2>{t("for_schools.why_title")}</h2>
            <p>{t("for_schools.why_body_1")}</p>
            <p>{t("for_schools.why_body_2")}</p>
          </article>
          <aside className="school-insight-panel">
            <p className="school-console-kicker">{t("for_schools.why_callout_label")}</p>
            <h3>{isZh ? "不是给学生直接答案，而是把老师的工作流结构化。" : "Not answer dumping. Structured teacher workflow."}</h3>
            <p>{t("for_schools.why_callout_body")}</p>
            <div className="school-proof-meter" aria-hidden>
              <span />
              <span />
              <span />
            </div>
          </aside>
        </div>
      </Section>

      {/* === THREE PILLARS === */}
      <Section>
        <div className="school-section-heading">
          <Eyebrow>{t("for_schools.pillars_eyebrow")}</Eyebrow>
          <h2>{t("for_schools.pillars_title")}</h2>
        </div>
        <div className="school-capability-grid">
          {[
            {
              key: "pillar_1",
              num: "01"
            },
            {
              key: "pillar_2",
              num: "02"
            },
            {
              key: "pillar_3",
              num: "03"
            }
          ].map((pillar) => (
            <article
              key={pillar.key}
              className="school-capability-card"
            >
              <span className="school-capability-index">{pillar.num}</span>
              <h3>
                {t(`for_schools.${pillar.key}_title` as never)}
              </h3>
              <p>
                {t(`for_schools.${pillar.key}_body` as never)}
              </p>
            </article>
          ))}
        </div>
      </Section>

      {/* === CORE FUNCTION MOTIONS === */}
      <Section className="school-core-section">
        <SectionHeader
          eyebrow={t("for_schools.core_eyebrow")}
          title={t("for_schools.core_title")}
          lede={t("for_schools.core_lede")}
        />
        <div className="motion-showcase mt-10 grid gap-8">
          <OcrDemo
            eyebrow={t("home.demo.ocr_eyebrow")}
            title={t("home.demo.ocr_title")}
          />
          <GradingDemo
            eyebrow={t("home.demo.grading_eyebrow")}
            title={t("home.demo.grading_title")}
          />
          <HintDemo
            eyebrow={t("home.demo.hint_eyebrow")}
            title={t("home.demo.hint_title")}
          />
          <ReportDemo
            eyebrow={t("home.demo.report_eyebrow")}
            title={t("home.demo.report_title")}
          />
        </div>
      </Section>

      {/* === WORKFLOW === */}
      <Section>
        <article className="school-workflow-panel">
          <Eyebrow>{t("for_schools.flow_eyebrow")}</Eyebrow>
          <h2>{t("for_schools.flow_title")}</h2>
          <ol className="school-flow-list">
            {(["01", "02", "03", "04"] as const).map((num, idx) => {
              const slot = (idx + 1) as 1 | 2 | 3 | 4;
              return (
                <li key={num}>
                  <span>{num}</span>
                  <div className="flex flex-col gap-1">
                    <h4>
                      {t(`for_schools.flow_${slot}_title` as never)}
                    </h4>
                    <p>
                      {t(`for_schools.flow_${slot}_body` as never)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </article>
      </Section>

      {/* === CONTACT === */}
      <Section>
        <article className="school-contact-panel">
          <Eyebrow>{t("for_schools.contact_eyebrow")}</Eyebrow>
          <h2>
            {t("for_schools.cta_panel_title")}
          </h2>
          <p>
            {t("for_schools.cta_panel_body")}
          </p>
          <div className="school-contact-grid">
            <dl className="grid gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 font-semibold">
                  {t("for_schools.contact_wechat")}
                </dt>
                <dd>17806162865</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 font-semibold">
                  {t("for_schools.contact_email")}
                </dt>
                <dd>
                  <a
                    href={`mailto:${contactEmail}`}
                  >
                    {contactEmail}
                  </a>
                </dd>
              </div>
            </dl>
            <Link href="/register/school" className="btn-secondary self-start md:self-center">
              {t("for_schools.cta_register_school")}
            </Link>
          </div>
        </article>
      </Section>
    </main>
  );
}
