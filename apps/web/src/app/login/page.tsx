"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useT } from "@/i18n/client";
import { Eyebrow, Section } from "@/components/ui";

/**
 * Login page — v3 design system.
 *
 * Two-column on desktop: editorial left (florid headline, value
 * propositions); form right. Stacks vertically on mobile. The form
 * is wrapped in `surface-card` so it pops against the cream page.
 */
export default function LoginPage() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Set when the backend tells us the account exists + password is
  // correct but emailVerifiedAt is null. We surface a "resend
  // verification email" affordance in this case.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendInfo, setResendInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNeedsVerification(false);
    setResendInfo(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl
    });

    setLoading(false);

    if (result?.error) {
      // NextAuth packs thrown Error.messages into result.error.
      // Distinguish "email not verified" from generic credential
      // failure so we can show the resend affordance.
      if (result.error === "EMAIL_NOT_VERIFIED") {
        setError(t("login.error_unverified"));
        setNeedsVerification(true);
      } else {
        setError(t("login.error_invalid"));
      }
      return;
    }

    router.push(result?.url ?? callbackUrl);
    router.refresh();
  }

  async function onResendVerification() {
    setResending(true);
    setResendInfo(null);
    try {
      await fetch("/api/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });
      // We always show the same neutral message regardless of the
      // backend response — the endpoint doesn't reveal whether the
      // address matches a real account.
      setResendInfo(t("login.resend_info"));
    } catch {
      setResendInfo(t("login.resend_info"));
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="motion-rise mx-auto w-full max-w-6xl">
      <Section tight className="pt-4 md:pt-6">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12 lg:items-center">
          {/* Editorial side */}
          <div className="flex flex-col gap-6">
            <Eyebrow>{t("login.kicker")}</Eyebrow>
            <h1
              className="display-headline"
              style={{ fontSize: "clamp(2rem, 4.4vw, 3.25rem)" }}
            >
              <span className="florid florid-gradient">
                {t("login.headline")}
              </span>
            </h1>
            <p className="display-lede">{t("login.subhead")}</p>

            <div className="grid gap-3">
              <div
                style={{
                  background: "var(--surface-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: 18
                }}
              >
                <p
                  className="text-[11px] font-semibold uppercase"
                  style={{
                    color: "var(--subtle)",
                    letterSpacing: "0.14em",
                    fontFamily: "var(--font-mono-custom)"
                  }}
                >
                  {t("login.stat_student_label")}
                </p>
                <p
                  className="mt-2 text-sm"
                  style={{ color: "var(--foreground)" }}
                >
                  {t("login.stat_student_body")}
                </p>
              </div>
              <div
                style={{
                  background: "var(--surface-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: 18
                }}
              >
                <p
                  className="text-[11px] font-semibold uppercase"
                  style={{
                    color: "var(--subtle)",
                    letterSpacing: "0.14em",
                    fontFamily: "var(--font-mono-custom)"
                  }}
                >
                  {t("login.stat_verification_label")}
                </p>
                <p
                  className="mt-2 text-sm"
                  style={{ color: "var(--foreground)" }}
                >
                  {t("login.stat_verification_body")}
                </p>
              </div>
            </div>
          </div>

          {/* Form side */}
          <section className="surface-card" style={{ padding: 28 }}>
            <div className="flex flex-col gap-4">
              <span className="badge">{t("login.badge")}</span>
              <h2 style={{ fontSize: "clamp(1.5rem, 2.6vw, 2rem)", margin: 0 }}>
                {t("login.title")}
              </h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("login.subtitle")}
              </p>

              <form className="flex flex-col gap-4 mt-2" onSubmit={onSubmit}>
                <label
                  className="block text-sm font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  {t("login.email_label")}
                  <input
                    className="input-field"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </label>

                <label
                  className="block text-sm font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  {t("login.password_label")}
                  <input
                    className="input-field"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>

                {error ? (
                  <div
                    role="alert"
                    className="px-4 py-3 text-sm"
                    style={{
                      background: "var(--danger-soft)",
                      color: "var(--danger)",
                      border:
                        "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
                      borderRadius: "var(--radius-md)"
                    }}
                  >
                    {error}
                    {needsVerification ? (
                      <div className="mt-3 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={onResendVerification}
                          disabled={resending}
                          className="text-left text-sm font-semibold underline"
                          style={{ color: "var(--accent-strong)" }}
                        >
                          {resending
                            ? t("login.resend_loading")
                            : t("login.resend_cta")}
                        </button>
                        {resendInfo ? (
                          <span
                            className="text-xs"
                            style={{ color: "var(--muted)" }}
                          >
                            {resendInfo}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <button
                  className="btn-primary w-full"
                  disabled={loading}
                  type="submit"
                >
                  {loading ? t("login.submit_loading") : t("login.submit")}
                </button>
              </form>

              <div
                className="space-y-3 px-4 py-3"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)"
                }}
              >
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {t("login.first_time_help")}{" "}
                  <Link
                    className="font-semibold"
                    style={{ color: "var(--accent-strong)" }}
                    href="/login/set-password"
                  >
                    {t("login.first_time_link")}
                  </Link>
                  {t("login.first_time_suffix")}
                </p>
                <p className="text-xs" style={{ color: "var(--subtle)" }}>
                  {t("login.admin_create_prefix")}{" "}
                  <Link
                    className="hover:underline"
                    style={{ color: "var(--accent-strong)" }}
                    href="/register"
                  >
                    {t("login.admin_create_link")}
                  </Link>
                  .
                </p>
              </div>
            </div>
          </section>
        </div>
      </Section>
    </main>
  );
}
