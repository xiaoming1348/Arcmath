"use client";

import type { FormEvent } from "react";
import { useState } from "react";
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
    <main className="motion-rise mx-auto max-w-md">
      <section className="surface-card space-y-5">
        <div className="space-y-2">
          <span className="badge">Get started</span>
          <h1 className="text-2xl font-semibold text-slate-900">Create account</h1>
          <p className="text-sm text-slate-600">New users start as STUDENT. You can update roles later.</p>
        </div>

        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm text-slate-700">
            Name (optional)
            <input
              className="input-field"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="block text-sm text-slate-700">
            Email
            <input
              className="input-field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="block text-sm text-slate-700">
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

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-green-700">{success}</p> : null}

          <button className="btn-primary w-full" disabled={loading} type="submit">
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}
