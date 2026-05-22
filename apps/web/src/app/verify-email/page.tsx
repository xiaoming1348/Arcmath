import Link from "next/link";
import { prisma } from "@arcmath/db";
import { consumeVerificationToken } from "@/lib/email/verification";
import { Eyebrow, Section } from "@/components/ui";
import { translatorImpl as translator } from "@/i18n/dictionary";
import { resolveLocale } from "@/i18n/server";

/**
 * Email-verification landing page.
 *
 * The user clicks the link in their verification email which points
 * here with `?token=...`. We consume the token server-side on first
 * render and show one of four states:
 *
 *   - success     → email is now verified, prompt to log in
 *   - already used → benign (e.g. user clicked twice); same CTA
 *   - expired     → link is more than 24h old; offer resend link
 *   - invalid     → token never existed / malformed; offer signup link
 *
 * We deliberately do NOT sign the user in here — they may have clicked
 * from a different device than the one they registered on. Login is a
 * conscious second step.
 */
export const dynamic = "force-dynamic"; // never cache the verify result

type SearchParams = { token?: string | string[] };

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const locale = await resolveLocale();
  const t = translator(locale);
  const params = await searchParams;
  const rawToken = params.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  let state: "missing" | "ok" | "already_used" | "expired" | "invalid" =
    "missing";
  if (token) {
    const result = await consumeVerificationToken(prisma, token);
    if (result.ok) state = "ok";
    else if (result.reason === "ALREADY_USED") state = "already_used";
    else if (result.reason === "EXPIRED") state = "expired";
    else state = "invalid";
  }

  return (
    <main className="motion-rise mx-auto w-full max-w-2xl">
      <Section tight className="pt-4 md:pt-6">
        <div className="hero-panel">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <Eyebrow>{t("verify_email.eyebrow")}</Eyebrow>
              <h1
                className="display-headline"
                style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}
              >
                <span className="florid florid-gradient">
                  {state === "ok" || state === "already_used"
                    ? t("verify_email.title_success")
                    : state === "expired"
                      ? t("verify_email.title_expired")
                      : t("verify_email.title_invalid")}
                </span>
              </h1>
              <p className="display-lede">
                {state === "ok"
                  ? t("verify_email.lede_success")
                  : state === "already_used"
                    ? t("verify_email.lede_already_used")
                    : state === "expired"
                      ? t("verify_email.lede_expired")
                      : state === "missing"
                        ? t("verify_email.lede_missing")
                        : t("verify_email.lede_invalid")}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {(state === "ok" || state === "already_used") && (
                <Link
                  href="/login"
                  className="btn-primary w-full text-center"
                  style={{ display: "inline-block", padding: "14px 24px" }}
                >
                  {t("verify_email.cta_login")}
                </Link>
              )}
              {(state === "expired" || state === "invalid") && (
                <>
                  <Link
                    href="/login"
                    className="btn-primary w-full text-center"
                    style={{ display: "inline-block", padding: "14px 24px" }}
                  >
                    {t("verify_email.cta_resend")}
                  </Link>
                  <p
                    className="text-sm text-center"
                    style={{ color: "var(--muted)" }}
                  >
                    {t("verify_email.help_or")}{" "}
                    <Link
                      href="/register"
                      style={{ color: "var(--accent-strong)" }}
                      className="font-semibold"
                    >
                      {t("verify_email.help_signup")}
                    </Link>
                  </p>
                </>
              )}
              {state === "missing" && (
                <Link
                  href="/login"
                  className="btn-primary w-full text-center"
                  style={{ display: "inline-block", padding: "14px 24px" }}
                >
                  {t("verify_email.cta_login")}
                </Link>
              )}
            </div>
          </div>
        </div>
      </Section>
    </main>
  );
}
