/**
 * Phase C-1 — 0-5 mastery level grid for /me/progress.
 *
 * Each topic the student has touched gets a card with:
 *   - 6 squares (level 0 → 5) lit up to the student's current level
 *   - the level number + a one-word label (Just exploring, Learning, …)
 *   - the topic name and attempt count
 *   - a small recommendation tag ("Review" / "Progress" / "Advance" / "Explore")
 *
 * Server-rendered. No JS on client. Same design language as Phase B:
 * inline SVG-style dots via CSS box-shadow / borders, hand-rolled
 * Tailwind classes mixed with --css-vars.
 */

import type {
  MasteryLevel,
  MasteryRecommendation,
  TopicMastery
} from "@/lib/ai/student-progress-report";

type Props = {
  topics: TopicMastery[];
  /** Cap on rows (default 8) so a heavy user doesn't get a 50-row dump. */
  limit?: number;
  labels: {
    /** 6 strings indexed by mastery level. */
    levelNames: [string, string, string, string, string, string];
    /** Map of recommendation key → display string. */
    recommendation: Record<MasteryRecommendation, string>;
    /** Footer line. */
    legend: string;
    /** Shown when the student has no data yet. */
    empty: string;
  };
};

const LEVEL_COLOR_VAR: Record<MasteryLevel, string> = {
  0: "var(--border)",
  1: "var(--accent)",
  2: "var(--warning)",
  3: "var(--accent-strong)",
  4: "var(--success)",
  5: "var(--success)"
};

const RECOMMENDATION_TAG_COLOR: Record<MasteryRecommendation, string> = {
  explore: "var(--accent-strong)",
  review: "var(--warning)",
  progress: "var(--accent-strong)",
  advance: "var(--success)"
};

export function TopicMasteryGrid({ topics, limit = 8, labels }: Props) {
  if (topics.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {labels.empty}
      </p>
    );
  }
  const rows = topics.slice(0, limit);
  return (
    <div className="space-y-3">
      {rows.map((t) => (
        <div
          key={t.topicKey}
          className="flex flex-wrap items-center gap-3"
          style={{
            padding: 12,
            borderRadius: "var(--radius-md)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)"
          }}
        >
          {/* Topic label + attempts */}
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-semibold"
              style={{ color: "var(--foreground)" }}
              title={t.label}
            >
              {t.label}
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {t.attempts} · {Math.round(t.accuracy * 100)}%
            </p>
          </div>

          {/* The 6-square level bar */}
          <div className="flex gap-1" aria-label={`Mastery level ${t.level} of 5`}>
            {([0, 1, 2, 3, 4, 5] as const).map((i) => (
              <span
                key={i}
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background:
                    i <= t.level ? LEVEL_COLOR_VAR[t.level] : "transparent",
                  border:
                    i <= t.level
                      ? "1px solid transparent"
                      : "1px solid var(--border)"
                }}
              />
            ))}
          </div>

          {/* Level number + name */}
          <div className="min-w-[112px] text-right">
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              {labels.levelNames[t.level]}
            </span>
          </div>

          {/* Recommendation tag */}
          <span
            className="text-[11px] font-semibold uppercase"
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              background: `color-mix(in srgb, ${RECOMMENDATION_TAG_COLOR[t.recommendation]} 14%, transparent)`,
              color: RECOMMENDATION_TAG_COLOR[t.recommendation],
              letterSpacing: "0.08em",
              fontFamily: "var(--font-mono-custom)"
            }}
          >
            {labels.recommendation[t.recommendation]}
          </span>
        </div>
      ))}
      <p
        className="text-[10px]"
        style={{
          color: "var(--subtle)",
          fontFamily: "var(--font-mono-custom)",
          letterSpacing: "0.08em"
        }}
      >
        {labels.legend}
      </p>
    </div>
  );
}
