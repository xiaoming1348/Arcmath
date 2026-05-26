import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import { Eyebrow, Section } from "@/components/ui";

/**
 * Terms of Service — pilot v1.
 *
 * Pilot-critical: any international school doing due diligence will ask
 * for this page before signing students up. We keep the language plain
 * and avoid templating in clauses that don't apply to a free pilot
 * (no payment terms, no liability caps tied to fees). When pilot turns
 * paid, the user (or their counsel) should re-review the limits.
 */
export const dynamic = "force-static";

export default async function TermsPage() {
  const locale = await resolveLocale();
  const t = translator(locale);
  return (
    <main className="motion-rise">
      <Section tight className="pt-4 md:pt-6">
        <div className="hero-panel space-y-4">
          <Eyebrow>{t("legal.eyebrow")}</Eyebrow>
          <h1
            className="display-headline"
            style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}
          >
            {t("legal.terms_title")}
          </h1>
          <p className="display-lede">{t("legal.terms_lede")}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {t("legal.last_updated")}
          </p>
        </div>
      </Section>

      <Section tight>
        <article className="surface-card space-y-4" style={{ lineHeight: 1.7 }}>
          <Section2 heading={t("legal.terms_h_who")}>
            {t("legal.terms_body_who")}
          </Section2>
          <Section2 heading={t("legal.terms_h_accounts")}>
            {t("legal.terms_body_accounts")}
          </Section2>
          <Section2 heading={t("legal.terms_h_acceptable")}>
            {t("legal.terms_body_acceptable")}
          </Section2>
          <Section2 heading={t("legal.terms_h_content")}>
            {t("legal.terms_body_content")}
          </Section2>
          <Section2 heading={t("legal.terms_h_ai")}>
            {t("legal.terms_body_ai")}
          </Section2>
          <Section2 heading={t("legal.terms_h_termination")}>
            {t("legal.terms_body_termination")}
          </Section2>
          <Section2 heading={t("legal.terms_h_disclaimer")}>
            {t("legal.terms_body_disclaimer")}
          </Section2>
          <Section2 heading={t("legal.terms_h_changes")}>
            {t("legal.terms_body_changes")}
          </Section2>
          <Section2 heading={t("legal.contact_heading")}>
            {t("legal.contact_body")}
          </Section2>
        </article>
      </Section>
    </main>
  );
}

function Section2({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2
        className="text-lg font-semibold"
        style={{ color: "var(--foreground)" }}
      >
        {heading}
      </h2>
      <p className="text-sm" style={{ color: "var(--muted)", whiteSpace: "pre-line" }}>
        {children}
      </p>
    </section>
  );
}
