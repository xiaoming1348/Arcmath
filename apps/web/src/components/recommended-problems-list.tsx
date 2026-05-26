/**
 * Phase C-2 — recommended next problems list for /me/progress.
 *
 * Each item is a clickable card linking to the problem-set entry (we
 * don't deep-link to a single problem because the in-set viewer
 * navigates problems internally — and dropping the student mid-set
 * loses the practice-run rhythm).
 *
 * The page passes in an already-ranked list; this component just
 * renders cards with the title, topic, difficulty pill, and the
 * one-line "why we recommend this" reason.
 */

import Link from "next/link";
import type { RecommendedProblem } from "@/lib/ai/student-progress-report";

type Props = {
  problems: RecommendedProblem[];
  labels: {
    eyebrow: string;
    title: string;
    /** Shown when there are no recs (new student or fully advanced). */
    empty: string;
    /** Tooltip-style helper above the list. */
    help: string;
    /** Map of difficulty band → display label. */
    difficulty: { EASY: string; MEDIUM: string; HARD: string };
    /** Click-into CTA. */
    openCta: string;
  };
};

const DIFFICULTY_TONE = {
  EASY: { bg: "var(--success-soft)", color: "var(--success)" },
  MEDIUM: { bg: "var(--accent-soft)", color: "var(--accent-strong)" },
  HARD: { bg: "var(--warning-soft)", color: "var(--warning)" }
} as const;

export function RecommendedProblemsList({ problems, labels }: Props) {
  if (problems.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {labels.empty}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: "var(--subtle)" }}>
        {labels.help}
      </p>
      <ol className="space-y-2">
        {problems.map((p) => (
          <li
            key={p.problemId}
            style={{
              padding: 14,
              borderRadius: "var(--radius-md)",
              background: "var(--surface-card)",
              border: "1px solid var(--border)",
              transition: "border-color 160ms ease, transform 160ms ease"
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span
                    className="font-semibold uppercase"
                    style={{
                      color: "var(--subtle)",
                      letterSpacing: "0.12em",
                      fontFamily: "var(--font-mono-custom)"
                    }}
                  >
                    {p.contest}
                    {p.year ? ` · ${p.year}` : ""} · #{p.problemNumber}
                  </span>
                  {p.difficultyBand ? (
                    <span
                      className="text-[10px] font-semibold uppercase"
                      style={{
                        padding: "2px 7px",
                        borderRadius: 999,
                        background: DIFFICULTY_TONE[p.difficultyBand].bg,
                        color: DIFFICULTY_TONE[p.difficultyBand].color,
                        letterSpacing: "0.08em"
                      }}
                    >
                      {labels.difficulty[p.difficultyBand]}
                    </span>
                  ) : null}
                  <span style={{ color: "var(--muted)" }}>·</span>
                  <span style={{ color: "var(--muted)" }}>{p.topicLabel}</span>
                </div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--foreground)", lineHeight: 1.5 }}
                >
                  {p.statementSnippet}
                </p>
                <p
                  className="text-xs italic"
                  style={{ color: "var(--accent-strong)" }}
                >
                  {p.reason}
                </p>
              </div>
              <Link
                href={`/problems/set/${encodeURIComponent(p.problemSetId)}`}
                className="btn-secondary text-xs"
                style={{ flexShrink: 0 }}
              >
                {labels.openCta} →
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
