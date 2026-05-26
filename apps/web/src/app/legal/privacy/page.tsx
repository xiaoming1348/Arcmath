import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import { Eyebrow, Section } from "@/components/ui";

/**
 * Privacy Policy — pilot v1.
 *
 * Schools (especially international ones with GDPR-trained admins or
 * Chinese PIPL exposure) will not sign students up without a privacy
 * policy. This is a plain-language pilot draft — when revenue starts,
 * the user should put a real lawyer on it.
 *
 * The structure covers the standard four questions schools ask:
 *   - What data do you collect about students?
 *   - Where do you store it?
 *   - Do you share it with third parties?
 *   - How does a parent / student request deletion?
 */
export const dynamic = "force-static";

export default async function PrivacyPage() {
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
            {t("legal.privacy_title")}
          </h1>
          <p className="display-lede">{t("legal.privacy_lede")}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {t("legal.last_updated")}
          </p>
        </div>
      </Section>

      <Section tight>
        <article className="surface-card space-y-4" style={{ lineHeight: 1.7 }}>
          <Block heading={t("legal.privacy_h_collect")}>
            {t("legal.privacy_body_collect")}
          </Block>
          <Block heading={t("legal.privacy_h_use")}>
            {t("legal.privacy_body_use")}
          </Block>
          <Block heading={t("legal.privacy_h_storage")}>
            {t("legal.privacy_body_storage")}
          </Block>
          <Block heading={t("legal.privacy_h_third_party")}>
            {t("legal.privacy_body_third_party")}
          </Block>
          <Block heading={t("legal.privacy_h_retention")}>
            {t("legal.privacy_body_retention")}
          </Block>
          <Block heading={t("legal.privacy_h_rights")}>
            {t("legal.privacy_body_rights")}
          </Block>
          <Block heading={t("legal.privacy_h_minors")}>
            {t("legal.privacy_body_minors")}
          </Block>
          <Block heading={t("legal.contact_heading")}>
            {t("legal.contact_body")}
          </Block>
        </article>
      </Section>
    </main>
  );
}

function Block({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
        {heading}
      </h2>
      <p className="text-sm" style={{ color: "var(--muted)", whiteSpace: "pre-line" }}>
        {children}
      </p>
    </section>
  );
}
