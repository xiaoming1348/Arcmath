"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { Eyebrow, Section } from "@/components/ui";

/**
 * Register page — v3 design system, individual learner flow (B1).
 *
 * On successful submit we DON'T redirect — we replace the form with a
 * "check your email" success card. The user must click the link in
 * the verification email before they can sign in (login is hard-
 * blocked until emailVerifiedAt is set; see lib/auth.ts).
 *
 * School/teacher signup lives at /register/school.
 */
export default function RegisterPage() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined, password })
      });

      const payload = (await response.json()) as { error?: string };
      setLoading(false);

      if (!response.ok) {
        setError(payload.error ?? t("register.error_generic"));
        return;
      }

      setSubmittedEmail(email.trim().toLowerCase());
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error ? err.message : t("register.error_generic")
      );
    }
  }

  if (submittedEmail) {
    return (
      <main className="motion-rise mx-auto w-full max-w-2xl">
        <Section tight className="pt-4 md:pt-6">
          <div className="hero-panel">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <Eyebrow>{t("register.success_eyebrow")}</Eyebrow>
                <h1
                  className="display-headline"
                  style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}
                >
                  <span className="florid florid-gradient">
                    {t("register.success_title")}
                  </span>
                </h1>
                <p className="display-lede">
                  {t("register.success_body_prefix")}{" "}
                  <strong style={{ color: "var(--foreground)" }}>
                    {submittedEmail}
                  </strong>
                  {t("register.success_body_suffix")}
                </p>
              </div>

              <div
                className="px-4 py-3 text-sm"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--muted)"
                }}
              >
                {t("register.success_hint")}
              </div>

              <div className="flex flex-col gap-2">
                <Link
                  href="/login"
                  className="btn-primary w-full text-center"
                  style={{ display: "inline-block", padding: "14px 24px" }}
                >
                  {t("register.success_cta_login")}
                </Link>
                <button
                  type="button"
                  className="text-sm font-semibold underline"
                  style={{ color: "var(--accent-strong)" }}
                  onClick={() => setSubmittedEmail(null)}
                >
                  {t("register.success_change_email")}
                </button>
              </div>
            </div>
          </div>
        </Section>
      </main>
    );
  }

  return (
    <main className="motion-rise mx-auto w-full max-w-2xl">
      <Section tight className="pt-4 md:pt-6">
        <div className="hero-panel">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <Eyebrow>{t("register.eyebrow_student")}</Eyebrow>
              <h1
                className="display-headline"
                style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}
              >
                <span className="florid florid-gradient">
                  {t("register.title")}
                </span>
              </h1>
              <p className="display-lede">{t("register.subtitle")}</p>
            </div>

            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <label className="block text-sm font-medium" style={{ color: "var(--foreground)" }}>
                {t("register.name_label")}
                <input
                  className="input-field"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>

              <label className="block text-sm font-medium" style={{ color: "var(--foreground)" }}>
                {t("register.email_label")}
                <input
                  className="input-field"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              <label className="block text-sm font-medium" style={{ color: "var(--foreground)" }}>
                {t("register.password_label")}
                <input
                  className="input-field"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <span className="mt-2 block text-xs" style={{ color: "var(--subtle)" }}>
                  {t("register.password_help")}
                </span>
              </label>

              {error ? (
                <div
                  role="alert"
                  className="px-4 py-3 text-sm"
                  style={{
                    background: "var(--danger-soft)",
                    color: "var(--danger)",
                    border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
                    borderRadius: "var(--radius-md)"
                  }}
                >
                  {error}
                </div>
              ) : null}

              <button className="btn-primary w-full" disabled={loading} type="submit">
                {loading ? t("register.submit_loading") : t("register.submit")}
              </button>
            </form>

            <div
              className="px-4 py-3 flex flex-col gap-2"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)"
              }}
            >
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("register.school_prompt_prefix")}{" "}
                <Link
                  className="font-semibold"
                  style={{ color: "var(--accent-strong)" }}
                  href="/register/school"
                >
                  {t("register.school_prompt_link")}
                </Link>
              </p>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("register.signin_prefix")}{" "}
                <Link
                  className="font-semibold"
                  style={{ color: "var(--accent-strong)" }}
                  href="/login"
                >
                  {t("register.signin_link")}
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </Section>
    </main>
  );
}
