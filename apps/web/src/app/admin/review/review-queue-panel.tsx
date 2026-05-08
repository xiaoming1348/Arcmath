"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

type Scope =
  | "needs_attention"
  | "pending"
  | "failed"
  | "manual_review"
  | "missing_solution"
  | "draft_only";

const SCOPE_LABELS: Array<{ key: Scope; label: string }> = [
  { key: "needs_attention", label: "Needs attention" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "manual_review", label: "Manual review" },
  { key: "missing_solution", label: "Missing sketch" },
  { key: "draft_only", label: "Draft sets" }
];

/**
 * Review queue UI.
 *
 * The queue is deliberately simple: counters at the top, scope tabs to
 * slice the work, a scrollable list of rows with inline "mark SKIPPED",
 * "mark MANUAL_REVIEW", and "publish set" buttons.
 *
 * We don't try to do bulk actions or keyboard navigation yet — the pilot
 * volume is low enough (a few hundred rows a week) that a straightforward
 * UI beats a fancy one. The shape is extensible once we see which
 * actions admins actually reach for.
 */
export function ReviewQueuePanel() {
  const [scope, setScope] = useState<Scope>("needs_attention");
  const [cursor, setCursor] = useState<string | null>(null);

  const countsQuery = trpc.admin.review.counts.useQuery();
  const listQuery = trpc.admin.review.list.useQuery({
    scope,
    cursor: cursor ?? undefined,
    pageSize: 30
  });

  const utils = trpc.useContext();
  const setStatusMutation = trpc.admin.review.setFormalizedStatus.useMutation({
    onSuccess: () => {
      utils.admin.review.list.invalidate();
      utils.admin.review.counts.invalidate();
    }
  });
  const setSetStatusMutation = trpc.admin.review.setProblemSetStatus.useMutation({
    onSuccess: () => {
      utils.admin.review.list.invalidate();
      utils.admin.review.counts.invalidate();
    }
  });

  return (
    <>
      <section className="grid gap-3 md:grid-cols-5">
        <CountCard label="Pending" value={countsQuery.data?.pending} />
        <CountCard label="Failed" value={countsQuery.data?.failed} />
        <CountCard
          label="Manual review"
          value={countsQuery.data?.manualReview}
        />
        <CountCard
          label="Missing sketch"
          value={countsQuery.data?.missingSolutionSketch}
        />
        <CountCard label="Draft sets" value={countsQuery.data?.draftSets} />
      </section>

      <section className="surface-card space-y-4">
        <div className="flex flex-wrap gap-2">
          {SCOPE_LABELS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                scope === item.key
                  ? "rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white"
                  : "rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-600 hover:border-[var(--accent)]"
              }
              onClick={() => {
                setScope(item.key);
                setCursor(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {setStatusMutation.error ? (
          <p className="text-sm text-red-600">
            {setStatusMutation.error.message}
          </p>
        ) : null}
        {setSetStatusMutation.error ? (
          <p className="text-sm text-red-600">
            {setSetStatusMutation.error.message}
          </p>
        ) : null}

        {listQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : listQuery.error ? (
          <p className="text-sm text-red-600">{listQuery.error.message}</p>
        ) : (
          <ul className="space-y-3">
            {(listQuery.data?.items ?? []).map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500">
                      <span className="font-mono">
                        {item.set.contest} {item.set.year}
                        {item.set.exam ? ` ${item.set.exam}` : ""}
                      </span>{" "}
                      · {item.set.title} · #{item.number}
                    </p>
                    <p className="text-sm text-slate-900">
                      {item.statementPreview}
                    </p>
                    <p className="text-xs text-slate-500">
                      Format:{" "}
                      <span className="font-semibold">{item.answerFormat}</span>{" "}
                      · Status:{" "}
                      <span className="font-semibold">
                        {item.formalizedStatus}
                      </span>
                      {item.hasSolutionSketch ? null : (
                        <> · ✱ missing sketch</>
                      )}
                    </p>
                    {item.formalizedReason ? (
                      <p className="text-xs text-amber-700">
                        Reason: {item.formalizedReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-stretch gap-2 min-w-[180px]">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={setStatusMutation.isPending}
                      onClick={() =>
                        setStatusMutation.mutate({
                          problemId: item.id,
                          status: "MANUAL_REVIEW",
                          reason: "flagged for manual review from queue"
                        })
                      }
                    >
                      Mark manual-review
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={setStatusMutation.isPending}
                      onClick={() =>
                        setStatusMutation.mutate({
                          problemId: item.id,
                          status: "SKIPPED",
                          reason: "non-proof; formalization not applicable"
                        })
                      }
                    >
                      Skip formalization
                    </button>
                    {item.set.status === "DRAFT" ? (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={setSetStatusMutation.isPending}
                        onClick={() => {
                          setSetStatusMutation.mutate({
                            problemSetId: item.set.id,
                            status: "PUBLISHED",
                            allowPendingProofs: false
                          });
                        }}
                      >
                        Publish set
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={setSetStatusMutation.isPending}
                        onClick={() => {
                          setSetStatusMutation.mutate({
                            problemSetId: item.set.id,
                            status: "DRAFT",
                            allowPendingProofs: false
                          });
                        }}
                      >
                        Unpublish set
                      </button>
                    )}
                    <Link
                      href={`/admin/import?contest=${encodeURIComponent(item.set.contest)}&year=${item.set.year}${item.set.exam ? `&exam=${encodeURIComponent(item.set.exam)}` : ""}`}
                      className="text-xs text-center text-[var(--accent)] underline"
                    >
                      Open set in importer
                    </Link>
                  </div>
                </div>
              </li>
            ))}
            {listQuery.data?.items.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing to review. 🎉</p>
            ) : null}
          </ul>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={!cursor}
            onClick={() => setCursor(null)}
          >
            Back to top
          </button>
          {listQuery.data?.nextCursor ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setCursor(listQuery.data!.nextCursor!)}
            >
              Next page
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}

function CountCard({
  label,
  value
}: {
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="surface-card">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">
        {typeof value === "number" ? value : "—"}
      </p>
    </div>
  );
}
