"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useT } from "@/i18n/client";

export default function LoginPage() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl
    });

    setLoading(false);

    if (result?.error) {
      setError(t("login.error_invalid"));
      return;
    }

    router.push(result?.url ?? callbackUrl);
    router.refresh();
  }

  return (
    <main className="motion-rise mx-auto w-full max-w-5xl">
      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="hero-panel">
          <div className="relative space-y-6">
            <div className="space-y-3">
              <span className="kicker">{t("login.kicker")}</span>
              <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">{t("login.headline")}</h1>
              <p className="max-w-lg text-sm md:text-base">{t("login.subhead")}</p>
            </div>

            <div className="grid gap-3">
              <div className="hero-stat">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/70">
                  {t("login.stat_student_label")}
                </p>
                <p className="mt-2 text-sm">{t("login.stat_student_body")}</p>
              </div>
              <div className="hero-stat">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/70">
                  {t("login.stat_verification_label")}
                </p>
                <p className="mt-2 text-sm">{t("login.stat_verification_body")}</p>
              </div>
            </div>
          </div>
        </div>

        <section className="surface-card space-y-5">
          <div className="space-y-2">
            <span className="badge">{t("login.badge")}</span>
            <h2 className="text-3xl font-semibold tracking-[-0.05em] text-slate-900">{t("login.title")}</h2>
            <p className="text-sm text-slate-600">{t("login.subtitle")}</p>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              {t("login.email_label")}
              <input
                className="input-field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              {t("login.password_label")}
              <input
                className="input-field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}

            <button className="btn-primary w-full" disabled={loading} type="submit">
              {loading ? t("login.submit_loading") : t("login.submit")}
            </button>
          </form>

          <div className="space-y-3 rounded-[1.4rem] border border-[rgba(16,35,60,0.08)] bg-[rgba(243,247,251,0.88)] px-4 py-4">
            <p className="text-sm text-slate-600">
              {t("login.first_time_help")}{" "}
              <Link
                className="font-semibold text-[var(--accent-strong)]"
                href="/login/set-password"
              >
                {t("login.first_time_link")}
              </Link>
              {t("login.first_time_suffix")}
            </p>
            <p className="text-xs text-slate-500">
              {t("login.admin_create_prefix")}{" "}
              <Link className="text-[var(--accent-strong)] hover:underline" href="/register">
                {t("login.admin_create_link")}
              </Link>
              .
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
