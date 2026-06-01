"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/loading-spinner";

/**
 * Shown on the problem-set page when the student opens a real-exam set
 * (AMC, AIME, USAMO, etc.) and no live run exists yet for this set.
 * Two cards:
 *   - Mock    → simulated exam: no hints, no real-time step feedback
 *   - Practice → normal Arcmath flow: hints + step mentor on
 *
 * Once chosen, the mode is locked on the new PracticeRun. To switch,
 * the student must Start over the whole run (destructive — deletes all
 * attempts in this run). The locked-in semantics keeps the mock-exam
 * experience honest.
 */
export function RealExamModeChooser({
  problemSetId,
  labels
}: {
  problemSetId: string;
  labels: {
    eyebrow: string;
    title: string;
    helper: string;
    mockTitle: string;
    mockBody: string;
    practiceTitle: string;
    practiceBody: string;
    mockCta: string;
    practiceCta: string;
    error: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingMode, setPendingMode] = useState<"MOCK" | "PRACTICE" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  function pick(mode: "MOCK" | "PRACTICE") {
    if (pending) return;
    setError(null);
    setPendingMode(mode);
    startTransition(async () => {
      try {
        const r = await fetch("/api/practice-runs/start-real-exam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ problemSetId, mode })
        });
        const data = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!r.ok || !data.ok) {
          setError(data.error || labels.error);
          setPendingMode(null);
          return;
        }
        // Refresh the route — the set page will re-fetch, find the new
        // run, and render the normal problem list (with mode wired
        // through). router.refresh re-runs the server component without
        // a full reload.
        router.refresh();
      } catch {
        setError(labels.error);
        setPendingMode(null);
      }
    });
  }

  return (
    <section
      aria-labelledby="real-exam-chooser-title"
      className="surface-card space-y-4"
    >
      <div className="space-y-2">
        <span
          className="text-[11px] font-semibold uppercase"
          style={{
            color: "var(--accent-strong, #2b6fff)",
            letterSpacing: "0.16em",
            fontFamily: "var(--font-mono-custom)"
          }}
        >
          {labels.eyebrow}
        </span>
        <h2
          id="real-exam-chooser-title"
          className="text-xl font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          {labels.title}
        </h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {labels.helper}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          className="flex flex-col items-start gap-2 rounded-2xl border-2 bg-white p-5 text-left transition disabled:opacity-60 hover:bg-slate-50 border-slate-300"
          onClick={() => pick("MOCK")}
          disabled={pending}
        >
          <span className="font-semibold text-slate-900">
            {labels.mockTitle}
          </span>
          <span className="text-xs text-slate-600">{labels.mockBody}</span>
          <span className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            {pending && pendingMode === "MOCK" && <LoadingSpinner />}
            {labels.mockCta}
          </span>
        </button>

        <button
          type="button"
          className="flex flex-col items-start gap-2 rounded-2xl border-2 bg-white p-5 text-left transition disabled:opacity-60 hover:bg-emerald-50 border-emerald-300"
          onClick={() => pick("PRACTICE")}
          disabled={pending}
        >
          <span className="font-semibold text-slate-900">
            {labels.practiceTitle}
          </span>
          <span className="text-xs text-slate-600">
            {labels.practiceBody}
          </span>
          <span className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">
            {pending && pendingMode === "PRACTICE" && <LoadingSpinner />}
            {labels.practiceCta}
          </span>
        </button>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "#dc2626" }} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
