"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { LoadingSpinner } from "@/components/loading-spinner";

type Props = {
  labels: {
    eyebrow: string;
    title: string;
    helper: string;
    cta: string;
    pending: string;
    regenerate: string;
    errorFallback: string;
    generatedAt: string;
  };
};

/**
 * β: on-demand AI insight panel for /reports/revisit.
 *
 * Server-side this is one mutation that builds a prompt out of the
 * last 5 sets' wrong attempts + topic distribution, calls OpenAI for
 * a short paragraph, and returns the text. The button intentionally
 * doesn't auto-fire on page load — students who care will click it,
 * and we don't pay tokens for the ones who don't.
 *
 * No persistence yet: clicking 'Regenerate' is a fresh OpenAI call.
 * If we want to cache, the natural spot is LearningReportSnapshot
 * with a `revisitInsightJson` field; defer until cost or latency
 * actually warrants it.
 */
export function RevisitInsightPanel({ labels }: Props) {
  const [insight, setInsight] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const mutation = trpc.learningReport.generateRevisitInsight.useMutation({
    onSuccess: (data) => {
      setInsight(data.insight);
      setGeneratedAt(data.generatedAt);
    }
  });

  return (
    <section
      className="surface-card space-y-3"
      style={{
        background:
          "color-mix(in srgb, var(--accent-strong, #2b6fff) 6%, var(--surface-card))",
        border:
          "1px solid color-mix(in srgb, var(--accent-strong, #2b6fff) 24%, transparent)"
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1" style={{ minWidth: 0, flex: 1 }}>
          <span
            className="text-[11px] font-semibold uppercase"
            style={{
              color: "var(--accent-strong, #2b6fff)",
              letterSpacing: "0.14em",
              fontFamily: "var(--font-mono-custom)"
            }}
          >
            {labels.eyebrow}
          </span>
          <h2
            className="mt-1"
            style={{
              fontSize: "clamp(1.25rem, 2vw, 1.5rem)",
              color: "var(--foreground-strong)"
            }}
          >
            {labels.title}
          </h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {labels.helper}
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <span className="inline-flex items-center gap-2">
              <LoadingSpinner />
              {labels.pending}
            </span>
          ) : insight ? (
            labels.regenerate
          ) : (
            labels.cta
          )}
        </button>
      </div>

      {mutation.isError ? (
        <p className="text-sm" style={{ color: "#dc2626" }}>
          {mutation.error?.message || labels.errorFallback}
        </p>
      ) : null}

      {insight ? (
        <div className="space-y-2">
          <p
            className="text-sm leading-7"
            style={{ color: "var(--foreground)" }}
          >
            {insight}
          </p>
          {generatedAt ? (
            <p
              className="text-[11px]"
              style={{
                color: "var(--subtle)",
                fontFamily: "var(--font-mono-custom)"
              }}
            >
              {labels.generatedAt.replace(
                "{time}",
                new Date(generatedAt).toLocaleString()
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
