import Link from "next/link";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import { Eyebrow, Section } from "@/components/ui";

/**
 * /for-schools — public landing page for the bilingual school-outreach
 * funnel. Mirrors the PDF brochure (Arcmath_pilot_brochure.pdf) so the
 * email's three CTAs (open PDF, click site, schedule call) all land on
 * cohesive content.
 *
 * Audience: 国际学校学术副校长 / 数学组组长.
 * Tone: confident-but-not-salesy; lead with the bottleneck (teacher
 * hours), not the technology.
 *
 * No auth required — this is a public marketing surface. Authenticated
 * users still see the same page (we don't bounce them; in case a
 * teacher previewing the link is already logged in, they can keep
 * reading).
 */
export const dynamic = "force-dynamic";

export default async function ForSchoolsPage() {
  const locale = await resolveLocale();
  const t = translator(locale);

  return (
    <main className="motion-rise space-y-4">
      {/* === HERO === */}
      <Section className="pt-6">
        <div className="hero-panel">
          <div className="flex flex-col gap-6">
            <Eyebrow>{t("for_schools.eyebrow")}</Eyebrow>
            <h1
              className="display-headline"
              style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)" }}
            >
              <span className="florid florid-gradient">
                {t("for_schools.hero_title")}
              </span>
            </h1>
            <p className="display-lede" style={{ maxWidth: 700 }}>
              {t("for_schools.hero_lede")}
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="mailto:yimingsun@forecaster-ai.com?subject=Arcmath%20pilot%20enquiry"
                className="btn-primary"
              >
                {t("for_schools.cta_email")}
              </a>
              <Link href="/register/school" className="btn-secondary">
                {t("for_schools.cta_register_school")}
              </Link>
            </div>
            <p className="text-xs" style={{ color: "var(--subtle)" }}>
              {t("for_schools.pilot_badge")}
            </p>
          </div>
        </div>
      </Section>

      {/* === WHY THIS MATTERS === */}
      <Section>
        <article className="surface-card space-y-3">
          <Eyebrow>{t("for_schools.why_eyebrow")}</Eyebrow>
          <h2 className="text-2xl font-semibold text-slate-900">
            {t("for_schools.why_title")}
          </h2>
          <p className="text-base text-slate-700" style={{ lineHeight: 1.7 }}>
            {t("for_schools.why_body_1")}
          </p>
          <p className="text-base text-slate-700" style={{ lineHeight: 1.7 }}>
            {t("for_schools.why_body_2")}
          </p>
          <div
            style={{
              marginTop: 12,
              padding: 20,
              borderRadius: "var(--radius-md)",
              background: "var(--accent-soft)",
              border:
                "1px solid color-mix(in srgb, var(--accent) 30%, transparent)"
            }}
          >
            <p
              className="text-[11px] font-semibold uppercase"
              style={{
                color: "var(--accent-strong)",
                letterSpacing: "0.14em",
                fontFamily: "var(--font-mono-custom)"
              }}
            >
              {t("for_schools.why_callout_label")}
            </p>
            <p
              className="mt-2 text-base"
              style={{ color: "var(--foreground)", lineHeight: 1.6 }}
            >
              {t("for_schools.why_callout_body")}
            </p>
          </div>
        </article>
      </Section>

      {/* === THREE PILLARS === */}
      <Section>
        <div className="space-y-3">
          <Eyebrow>{t("for_schools.pillars_eyebrow")}</Eyebrow>
          <h2 className="text-2xl font-semibold text-slate-900">
            {t("for_schools.pillars_title")}
          </h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            {
              key: "pillar_1",
              num: "1"
            },
            {
              key: "pillar_2",
              num: "2"
            },
            {
              key: "pillar_3",
              num: "3"
            }
          ].map((pillar) => (
            <article
              key={pillar.key}
              className="surface-card flex flex-col gap-3"
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold"
                style={{
                  background: "var(--accent-strong)",
                  color: "#fff"
                }}
              >
                {pillar.num}
              </span>
              <h3 className="text-lg font-semibold text-slate-900">
                {t(`for_schools.${pillar.key}_title` as never)}
              </h3>
              <p className="text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                {t(`for_schools.${pillar.key}_body` as never)}
              </p>
            </article>
          ))}
        </div>
      </Section>

      {/* === WORKFLOW === */}
      <Section>
        <article className="surface-card space-y-4">
          <Eyebrow>{t("for_schools.flow_eyebrow")}</Eyebrow>
          <h2 className="text-2xl font-semibold text-slate-900">
            {t("for_schools.flow_title")}
          </h2>
          <ol className="mt-2 space-y-3">
            {(["01", "02", "03", "04"] as const).map((num, idx) => {
              const slot = (idx + 1) as 1 | 2 | 3 | 4;
              return (
                <li
                  key={num}
                  className="flex gap-4"
                  style={{
                    padding: 16,
                    borderRadius: "var(--radius-md)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)"
                  }}
                >
                  <span
                    className="text-xl font-bold shrink-0"
                    style={{
                      color: "var(--accent-strong)",
                      fontFamily: "var(--font-mono-custom)",
                      width: 36
                    }}
                  >
                    {num}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h4 className="text-base font-semibold text-slate-900">
                      {t(`for_schools.flow_${slot}_title` as never)}
                    </h4>
                    <p
                      className="text-sm"
                      style={{ color: "var(--muted)", lineHeight: 1.6 }}
                    >
                      {t(`for_schools.flow_${slot}_body` as never)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </article>
      </Section>

      {/* === WHY US (differentiation) === */}
      <Section>
        <article className="surface-card space-y-4">
          <Eyebrow>{t("for_schools.diff_eyebrow")}</Eyebrow>
          <h2 className="text-2xl font-semibold text-slate-900">
            {t("for_schools.diff_title")}
          </h2>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            {(["tutors", "apps", "chatbots"] as const).map((slug) => (
              <div
                key={slug}
                style={{
                  padding: 16,
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)"
                }}
              >
                <h3
                  className="text-sm font-semibold"
                  style={{ color: "var(--accent-strong)" }}
                >
                  {t(`for_schools.diff_${slug}_title` as never)}
                </h3>
                <p
                  className="mt-2 text-sm"
                  style={{ color: "var(--muted)", lineHeight: 1.6 }}
                >
                  {t(`for_schools.diff_${slug}_body` as never)}
                </p>
              </div>
            ))}
          </div>
        </article>
      </Section>

      {/* === PILOT OFFER + CTA === */}
      <Section>
        <article
          className="surface-card space-y-4"
          style={{
            background: "var(--accent-soft)",
            border:
              "1.5px solid color-mix(in srgb, var(--accent) 35%, transparent)"
          }}
        >
          <Eyebrow>{t("for_schools.pilot_eyebrow")}</Eyebrow>
          <h2 className="text-2xl font-semibold text-slate-900">
            {t("for_schools.pilot_title")}
          </h2>
          <p className="text-base text-slate-700" style={{ lineHeight: 1.7 }}>
            {t("for_schools.pilot_body")}
          </p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--accent-strong)" }}>
                {t("for_schools.pilot_get_title")}
              </h3>
              <ul
                className="mt-2 space-y-1 text-sm"
                style={{ color: "var(--muted)", lineHeight: 1.6 }}
              >
                {(["get_1", "get_2", "get_3", "get_4", "get_5"] as const).map((k) => (
                  <li key={k}>· {t(`for_schools.pilot_${k}` as never)}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--accent-strong)" }}>
                {t("for_schools.pilot_ask_title")}
              </h3>
              <ul
                className="mt-2 space-y-1 text-sm"
                style={{ color: "var(--muted)", lineHeight: 1.6 }}
              >
                {(["ask_1", "ask_2", "ask_3"] as const).map((k) => (
                  <li key={k}>· {t(`for_schools.pilot_${k}` as never)}</li>
                ))}
              </ul>
            </div>
          </div>
          <div
            className="mt-4 flex flex-col gap-2"
            style={{
              padding: 18,
              borderRadius: "var(--radius-md)",
              background: "var(--surface-card)",
              border: "1px solid var(--border)"
            }}
          >
            <p className="text-base font-semibold text-slate-900">
              {t("for_schools.cta_panel_title")}
            </p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {t("for_schools.cta_panel_body")}
            </p>
            <dl className="mt-2 grid gap-1 text-sm">
              <div className="flex gap-2">
                <dt
                  className="w-20 shrink-0 font-semibold"
                  style={{ color: "var(--subtle)" }}
                >
                  {t("for_schools.contact_wechat")}
                </dt>
                <dd>17806162865</dd>
              </div>
              <div className="flex gap-2">
                <dt
                  className="w-20 shrink-0 font-semibold"
                  style={{ color: "var(--subtle)" }}
                >
                  {t("for_schools.contact_email")}
                </dt>
                <dd>
                  <a
                    href="mailto:yimingsun@forecaster-ai.com"
                    style={{ color: "var(--accent-strong)" }}
                  >
                    yimingsun@forecaster-ai.com
                  </a>
                  {" · "}
                  <a
                    href="mailto:yimingsun@berkeley.edu"
                    style={{ color: "var(--accent-strong)" }}
                  >
                    yimingsun@berkeley.edu
                  </a>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt
                  className="w-20 shrink-0 font-semibold"
                  style={{ color: "var(--subtle)" }}
                >
                  {t("for_schools.contact_founder")}
                </dt>
                <dd>{t("for_schools.contact_founder_name")}</dd>
              </div>
            </dl>
          </div>
        </article>
      </Section>
    </main>
  );
}
