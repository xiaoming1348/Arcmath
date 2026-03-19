"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
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
      setError(payload.error ?? "Registration failed");
      return;
    }

    setSuccess("Account created. Redirecting to login...");
    setTimeout(() => {
      router.push("/login");
    }, 600);
  }

  return (
    <main className="motion-rise mx-auto w-full max-w-5xl">
      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="surface-card space-y-5">
          <div className="space-y-2">
            <span className="badge">Get Started</span>
            <h1 className="text-3xl font-semibold tracking-[-0.05em] text-slate-900">Create account</h1>
            <p className="text-sm text-slate-600">New users start as STUDENT. You can update roles later.</p>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              Name (optional)
              <input
                className="input-field"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                className="input-field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                className="input-field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>

            {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}
            {success ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

            <button className="btn-primary w-full" disabled={loading} type="submit">
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <div className="rounded-[1.4rem] border border-[rgba(16,35,60,0.08)] bg-[rgba(243,247,251,0.88)] px-4 py-4">
            <p className="text-sm text-slate-600">
              Already registered?{" "}
              <Link className="font-semibold text-[var(--accent-strong)]" href="/login">
                Sign in here
              </Link>
              .
            </p>
          </div>
        </div>

        <section className="hero-panel">
          <div className="relative space-y-6">
            <div className="space-y-3">
              <span className="kicker">Smooth Onboarding</span>
              <h2 className="text-4xl font-semibold tracking-[-0.05em] text-white">
                Start in a workspace that feels calm from day one.
              </h2>
              <p className="max-w-lg text-sm md:text-base">
                The refreshed UI uses gentle depth, clearer typography, and restrained color transitions to feel modern
                without becoming distracting.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="hero-stat">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/70">Comfort</p>
                <p className="mt-2 text-sm">Longer sessions feel easier on the eyes thanks to softer surfaces and spacing.</p>
              </div>
              <div className="hero-stat">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/70">Clarity</p>
                <p className="mt-2 text-sm">Students and parents can orient themselves quickly without a noisy interface.</p>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
