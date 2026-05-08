"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useT } from "@/i18n/client";

/**
 * First-time password setup for roster-spawned accounts.
 *
 * The flow:
 *   1. Admin creates a class with a roster; system mints a User row
 *      with passwordHash = null and gives the admin the new user's
 *      auto-generated email (`<name>.<rand>@<org>.arcmath.local`).
 *   2. Admin shares that email with the student/teacher out of band.
 *   3. The user comes here, enters their email + a chosen password.
 *   4. The /api/set-password route accepts the request only if the
 *      account exists AND has no password yet (passwordHash === null).
 *   5. On success we sign them in via NextAuth so they land on their
 *      role home without a second login step.
 *
 * Trust model: there is no email verification. Anyone who knows the
 * generated username can set the password. That's acceptable for the
 * pilot because (a) usernames are auto-generated with random suffixes
 * and (b) admins distribute them out of band to a known student.
 * If a username leaks, the legitimate user can ask the admin to
 * regenerate (future feature).
 */
export default function SetPasswordPage() {
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t("set_password.error_short"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("set_password.error_mismatch"));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/set-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? t("set_password.error_generic"));
        setLoading(false);
        return;
      }

      // Now sign them in with the freshly-set credentials so they land
      // on their role home (the role-based redirect on /).
      const signInResult = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: "/"
      });

      setLoading(false);

      if (signInResult?.error) {
        // Password set, but sign-in failed somehow — punt to login.
        router.push("/login");
        return;
      }

      router.push(signInResult?.url ?? "/");
      router.refresh();
    } catch {
      setError(t("set_password.error_network"));
      setLoading(false);
    }
  }

  return (
    <main className="motion-rise mx-auto w-full max-w-2xl">
      <section className="surface-card space-y-5">
        <div className="space-y-2">
          <span className="badge">{t("set_password.badge")}</span>
          <h1 className="text-3xl font-semibold tracking-[-0.05em] text-slate-900">
            {t("set_password.title")}
          </h1>
          <p className="text-sm text-slate-600">{t("set_password.subtitle")}</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            {t("set_password.username_label")}
            <input
              className="input-field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("set_password.username_placeholder")}
              required
              autoComplete="username"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {t("set_password.new_password_label")}
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {t("set_password.confirm_password_label")}
            <input
              className="input-field"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>

          {error ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          ) : null}

          <button className="btn-primary w-full" disabled={loading} type="submit">
            {loading ? t("set_password.submit_loading") : t("set_password.submit")}
          </button>
        </form>

        <div className="rounded-[1.4rem] border border-[rgba(16,35,60,0.08)] bg-[rgba(243,247,251,0.88)] px-4 py-4 text-sm text-slate-600">
          {t("set_password.already_set_prefix")}{" "}
          <Link className="font-semibold text-[var(--accent-strong)]" href="/login">
            {t("set_password.already_set_link")}
          </Link>
          .
        </div>
      </section>
    </main>
  );
}
