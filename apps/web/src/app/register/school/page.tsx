"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { Eyebrow, Section } from "@/components/ui";

/**
 * School / organization admin signup (B2 flow).
 *
 * Creates User + Organization + OWNER membership server-side via
 * /api/register/school. On submit we show the same "check your email"
 * success card as the individual flow — the admin must verify their
 * email before they can sign in. Once verified, they land on /org
 * where they can create classes, invite teachers, and roster students.
 */
export default function RegisterSchoolPage() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/register/school", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: name || undefined,
          organizationName,
          password
        })
      });

      const payload = (await response.json()) as { error?: string };
      setLoading(false);

      if (!response.ok) {
        setError(payload.error ?? t("register_school.error_generic"));
        return;
      }

      setSubmittedEmail(email.trim().toLowerCase());
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error ? err.message : t("register_school.error_generic")
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
                <Eyebrow>{t("register_school.success_eyebrow")}</Eyebrow>
                <h1
                  className="display-headline"
                  style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}
                >
                  <span className="florid florid-gradient">
                    {t("register_school.success_title")}
                  </span>
                </h1>
                <p className="display-lede">
                  {t("register_school.success_body_prefix")}{" "}
                  <strong style={{ color: "var(--foreground)" }}>
                    {submittedEmail}
                  </strong>
                  {t("register_school.success_body_suffix")}
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
                {t("register_school.success_hint")}
              </div>

              <Link
                href="/login"
                className="btn-primary w-full text-center"
                style={{ display: "inline-block", padding: "14px 24px" }}
              >
                {t("register_school.success_cta_login")}
              </Link>
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
              <Eyebrow>{t("register_school.eyebrow")}</Eyebrow>
              <h1
                className="display-headline"
                style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}
              >
                <span className="florid florid-gradient">
                  {t("register_school.title")}
                </span>
              </h1>
              <p className="display-lede">{t("register_school.subtitle")}</p>
            </div>

            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <label
                className="block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                {t("register_school.org_name_label")}
                <input
                  className="input-field"
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="organization"
                  placeholder={t("register_school.org_name_placeholder")}
                />
                <span
                  className="mt-2 block text-xs"
                  style={{ color: "var(--subtle)" }}
                >
                  {t("register_school.org_name_help")}
                </span>
              </label>

              <label
                className="block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                {t("register_school.name_label")}
                <input
                  className="input-field"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>

              <label
                className="block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                {t("register_school.email_label")}
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
                {t("register_school.password_label")}
                <input
                  className="input-field"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <span
                  className="mt-2 block text-xs"
                  style={{ color: "var(--subtle)" }}
                >
                  {t("register_school.password_help")}
                </span>
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
                </div>
              ) : null}

              <button
                className="btn-primary w-full"
                disabled={loading}
                type="submit"
              >
                {loading
                  ? t("register_school.submit_loading")
                  : t("register_school.submit")}
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
                {t("register_school.student_prompt_prefix")}{" "}
                <Link
                  className="font-semibold"
                  style={{ color: "var(--accent-strong)" }}
                  href="/register"
                >
                  {t("register_school.student_prompt_link")}
                </Link>
              </p>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("register_school.signin_prefix")}{" "}
                <Link
                  className="font-semibold"
                  style={{ color: "var(--accent-strong)" }}
                  href="/login"
                >
                  {t("register_school.signin_link")}
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
