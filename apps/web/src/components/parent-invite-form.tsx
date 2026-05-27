"use client";

import { useState } from "react";

/**
 * Compact form for /org/students/[userId] — teacher enters a parent
 * email + optional relationship, submits to the invite API. Renders
 * inline success / error feedback. No router push — the row sticks
 * around so the teacher can issue more invites without a full reload.
 */
export function ParentInviteForm({
  studentUserId,
  labels
}: {
  studentUserId: string;
  labels: {
    heading: string;
    helper: string;
    emailLabel: string;
    emailPlaceholder: string;
    relationshipLabel: string;
    relationshipPlaceholder: string;
    submit: string;
    submitting: string;
    successPrefix: string;
    invalidEmail: string;
    genericError: string;
  };
}) {
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "ok"; expiresAt: string }
    | { kind: "err"; message: string }
  >({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === "submitting") return;

    // Client-side sanity check. Server enforces too.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus({ kind: "err", message: labels.invalidEmail });
      return;
    }
    setStatus({ kind: "submitting" });

    try {
      const r = await fetch(`/api/org/students/${studentUserId}/invite-parent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentEmail: email.trim(),
          relationship: relationship.trim() || null
        })
      });
      const data = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        expiresAt?: string;
      };
      if (!r.ok || !data.ok) {
        setStatus({
          kind: "err",
          message: data.error || labels.genericError
        });
        return;
      }
      setStatus({
        kind: "ok",
        expiresAt: data.expiresAt
          ? new Date(data.expiresAt).toISOString().slice(0, 10)
          : ""
      });
      setEmail("");
      setRelationship("");
    } catch {
      setStatus({ kind: "err", message: labels.genericError });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <div
          className="text-[11px] font-semibold uppercase mb-2"
          style={{
            color: "var(--accent-strong, #2b6fff)",
            letterSpacing: "0.16em",
            fontFamily: "var(--font-mono-custom)"
          }}
        >
          ✉ Parent access
        </div>
        <h3
          className="text-lg font-semibold leading-tight"
          style={{ color: "var(--foreground)" }}
        >
          {labels.heading}
        </h3>
        <p className="text-xs mt-1.5" style={{ color: "var(--muted)", maxWidth: 520, lineHeight: 1.6 }}>
          {labels.helper}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 min-w-[200px]">
          <span
            className="block text-xs mb-1"
            style={{ color: "var(--muted)" }}
          >
            {labels.emailLabel}
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={labels.emailPlaceholder}
            className="w-full rounded border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)"
            }}
            disabled={status.kind === "submitting"}
          />
        </label>
        <label className="min-w-[140px]">
          <span
            className="block text-xs mb-1"
            style={{ color: "var(--muted)" }}
          >
            {labels.relationshipLabel}
          </span>
          <input
            type="text"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder={labels.relationshipPlaceholder}
            className="w-full rounded border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)"
            }}
            disabled={status.kind === "submitting"}
            maxLength={64}
          />
        </label>
      </div>
      <button
        type="submit"
        className="btn-primary"
        disabled={status.kind === "submitting"}
      >
        {status.kind === "submitting" ? labels.submitting : labels.submit}
      </button>

      {status.kind === "ok" ? (
        <p
          className="text-sm"
          style={{ color: "var(--accent-strong, #16a34a)" }}
        >
          ✓ {labels.successPrefix}
          {status.expiresAt ? ` (${status.expiresAt})` : ""}
        </p>
      ) : status.kind === "err" ? (
        <p className="text-sm" style={{ color: "#dc2626" }}>
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
