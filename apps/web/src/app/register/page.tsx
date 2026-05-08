"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";

export default function RegisterPage() {
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

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

    setSuccess(t("register.submit_loading"));
    setTimeout(() => {
      router.push("/login");
    }, 600);
  }

  return (
    <main className="motion-rise mx-auto w-full max-w-2xl">
      <section className="surface-card space-y-5">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-[-0.05em] text-slate-900">{t("register.title")}</h1>
          <p className="text-sm text-slate-600">{t("register.subtitle")}</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            {t("register.name_label")}
            <input
              className="input-field"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {t("register.email_label")}
            <input
              className="input-field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {t("register.password_label")}
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            <span className="mt-1 block text-xs text-slate-500">{t("register.password_help")}</span>
          </label>

          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}
          {success ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

          <button className="btn-primary w-full" disabled={loading} type="submit">
            {loading ? t("register.submit_loading") : t("register.submit")}
          </button>
        </form>

        <div className="rounded-[1.4rem] border border-[rgba(16,35,60,0.08)] bg-[rgba(243,247,251,0.88)] px-4 py-4">
          <p className="text-sm text-slate-600">
            {t("register.signin_prefix")}{" "}
            <Link className="font-semibold text-[var(--accent-strong)]" href="/login">
              {t("register.signin_link")}
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
