import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@arcmath/db";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import { Eyebrow, Section } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { FeedbackLanguageSwitcher } from "@/components/feedback-language-switcher";

/**
 * /account — student-facing settings page.
 *
 * 2026-05-21: Introduced primarily so the language switcher has a
 * dedicated, easy-to-find home. The compact toggle in the top nav was
 * small enough that several pilot testers missed it and assumed the
 * site was English-only. Putting a labeled "Display language" section
 * here makes the choice discoverable, and we can grow this page into
 * profile + email-preferences etc. without restructuring.
 */
export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Faccount");
  }

  const locale = await resolveLocale();
  const t = translator(locale);

  // Fetch a minimal slice — email and stored locale, both displayed
  // read-only as context next to the language toggle.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      locale: true,
      feedbackLocale: true,
      emailVerifiedAt: true
    }
  });

  if (!user) {
    redirect("/login?callbackUrl=%2Faccount");
  }

  return (
    <main className="motion-rise mx-auto w-full max-w-3xl">
      <Section tight className="pt-4 md:pt-6">
        <div className="hero-panel">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <Eyebrow>{t("account.eyebrow")}</Eyebrow>
              <h1
                className="display-headline"
                style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}
              >
                <span className="florid florid-gradient">
                  {t("account.title")}
                </span>
              </h1>
              <p className="display-lede">{t("account.subtitle")}</p>
            </div>

            {/* Profile snapshot — read-only for now. Edit-name flow can
                come later; for pilot we want one fewer field to debug. */}
            <div
              className="grid gap-3 sm:grid-cols-2"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: 18
              }}
            >
              <div>
                <p
                  className="text-[11px] font-semibold uppercase"
                  style={{
                    color: "var(--subtle)",
                    letterSpacing: "0.12em",
                    fontFamily: "var(--font-mono-custom)"
                  }}
                >
                  {t("account.email_label")}
                </p>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--foreground)" }}
                >
                  {user.email}
                </p>
              </div>
              {user.name ? (
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase"
                    style={{
                      color: "var(--subtle)",
                      letterSpacing: "0.12em",
                      fontFamily: "var(--font-mono-custom)"
                    }}
                  >
                    {t("account.name_label")}
                  </p>
                  <p
                    className="mt-1 text-sm"
                    style={{ color: "var(--foreground)" }}
                  >
                    {user.name}
                  </p>
                </div>
              ) : null}
            </div>

            {/* Language sections. Two independent prefs:
                 - Interface language: top-nav chrome, page titles,
                   problem-set listings. Controlled by LanguageSwitcher
                   (cookie + User.locale).
                 - Feedback language: AI tutor / step mentor / hint
                   output. Defaults to English because the competition
                   exams themselves are in English; students opt into
                   Chinese here. Controlled by FeedbackLanguageSwitcher
                   (User.feedbackLocale only). */}
            <div
              style={{
                padding: 20,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface-card)"
              }}
            >
              <p
                className="text-[11px] font-semibold uppercase"
                style={{
                  color: "var(--subtle)",
                  letterSpacing: "0.12em",
                  fontFamily: "var(--font-mono-custom)"
                }}
              >
                {t("account.language_label")}
              </p>
              <h2
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  marginTop: 8,
                  color: "var(--foreground)"
                }}
              >
                {t("account.ui_language_heading")}
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--muted)" }}
              >
                {t("account.ui_language_help")}
              </p>
              <div className="mt-3">
                <LanguageSwitcher />
              </div>
            </div>

            <div
              style={{
                padding: 20,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface-card)"
              }}
            >
              <p
                className="text-[11px] font-semibold uppercase"
                style={{
                  color: "var(--subtle)",
                  letterSpacing: "0.12em",
                  fontFamily: "var(--font-mono-custom)"
                }}
              >
                {t("account.feedback_language_label")}
              </p>
              <h2
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  marginTop: 8,
                  color: "var(--foreground)"
                }}
              >
                {t("account.feedback_language_heading")}
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--muted)" }}
              >
                {t("account.feedback_language_help")}
              </p>
              <div className="mt-3">
                <FeedbackLanguageSwitcher
                  initial={user.feedbackLocale === "zh" ? "zh" : "en"}
                />
              </div>
            </div>
          </div>
        </div>
      </Section>
    </main>
  );
}
