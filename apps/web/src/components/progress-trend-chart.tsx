/**
 * Server-rendered SVG charts for /me/progress (Phase B).
 *
 * Two components:
 *   - `AccuracyTrendChart` — line chart of cumulative accuracy over the
 *     last ~12 weekly snapshot points.
 *   - `TopicAccuracyBars` — horizontal bar chart of the top N topics
 *     by attempt count, with accuracy bars and a soft target line at 70%.
 *
 * Why hand-rolled SVG instead of recharts:
 *   - Zero dependencies → no `pnpm install` step on VPS deploy.
 *   - Server-rendered (this is a server component) → no client JS cost,
 *     no hydration mismatch, no flash-of-empty-chart.
 *   - Full design-system control: uses the same CSS variables (var(--accent),
 *     var(--muted), etc) as the rest of the v3 UI.
 *
 * Both components degrade gracefully on empty input (return null).
 */

import type {
  TopicSlice,
  WeeklySnapshotPoint
} from "@/lib/ai/student-progress-report";

// ----------------------------------------------------------------------------
// AccuracyTrendChart
// ----------------------------------------------------------------------------

type AccuracyTrendChartProps = {
  /** Oldest → newest. */
  points: WeeklySnapshotPoint[];
  /** Locale for the x-axis date labels — "en" → "Jan 12"; "zh" → "1月12日". */
  locale: "en" | "zh";
  /** Label texts (already localized) for axes + empty state. */
  labels: {
    title: string;
    yAxis: string;
    empty: string;
  };
};

const TREND_W = 560;
const TREND_H = 220;
const TREND_PAD = { top: 16, right: 16, bottom: 36, left: 44 };

export function AccuracyTrendChart({ points, locale, labels }: AccuracyTrendChartProps) {
  if (points.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {labels.empty}
      </p>
    );
  }

  const W = TREND_W;
  const H = TREND_H;
  const innerW = W - TREND_PAD.left - TREND_PAD.right;
  const innerH = H - TREND_PAD.top - TREND_PAD.bottom;

  // Y axis: 0 .. 1 (accuracy fraction). Always render full range so
  // students can read absolute accuracy at a glance.
  const yMin = 0;
  const yMax = 1;
  const yToPx = (y: number) =>
    TREND_PAD.top + innerH * (1 - (y - yMin) / (yMax - yMin));

  // X axis: equally-spaced points (we don't try to do real-time x-axis
  // because weekly points are by design uniform).
  const xToPx = (i: number) => {
    if (points.length === 1) return TREND_PAD.left + innerW / 2;
    return TREND_PAD.left + (innerW * i) / (points.length - 1);
  };

  // Polyline path "M x0 y0 L x1 y1 L x2 y2 ..."
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xToPx(i).toFixed(1)} ${yToPx(p.accuracy).toFixed(1)}`)
    .join(" ");

  // Gridlines at 0%, 25%, 50%, 75%, 100%
  const gridY = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", maxWidth: TREND_W, height: "auto" }}
        role="img"
        aria-label={labels.title}
      >
        {/* gridlines + y-axis labels */}
        {gridY.map((y) => (
          <g key={y}>
            <line
              x1={TREND_PAD.left}
              x2={W - TREND_PAD.right}
              y1={yToPx(y)}
              y2={yToPx(y)}
              stroke="currentColor"
              strokeWidth={0.5}
              opacity={y === 0 ? 0.4 : 0.15}
              style={{ color: "var(--border)" }}
            />
            <text
              x={TREND_PAD.left - 6}
              y={yToPx(y) + 3}
              textAnchor="end"
              fontSize="10"
              fill="currentColor"
              style={{ color: "var(--subtle)" }}
            >
              {Math.round(y * 100)}%
            </text>
          </g>
        ))}

        {/* x-axis labels (only first, middle, last for cleanliness) */}
        {[0, Math.floor(points.length / 2), points.length - 1]
          .filter((i, idx, arr) => arr.indexOf(i) === idx) // dedup when n < 3
          .map((i) => (
            <text
              key={i}
              x={xToPx(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
              style={{ color: "var(--subtle)" }}
            >
              {formatDateShort(new Date(points[i].windowEnd), locale)}
            </text>
          ))}

        {/* trend line */}
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--accent-strong)" }}
        />

        {/* data point dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xToPx(i)}
            cy={yToPx(p.accuracy)}
            r={i === points.length - 1 ? 4 : 3}
            fill="currentColor"
            style={{ color: "var(--accent-strong)" }}
          />
        ))}

        {/* axis title (y) */}
        <text
          x={12}
          y={H / 2}
          fontSize="10"
          fill="currentColor"
          textAnchor="middle"
          transform={`rotate(-90 12 ${H / 2})`}
          style={{ color: "var(--subtle)" }}
        >
          {labels.yAxis}
        </text>
      </svg>
    </div>
  );
}

function formatDateShort(d: Date, locale: "en" | "zh"): string {
  if (locale === "zh") {
    return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  }
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    d.getUTCMonth()
  ];
  return `${month} ${d.getUTCDate()}`;
}

// ----------------------------------------------------------------------------
// TopicAccuracyBars
// ----------------------------------------------------------------------------

type TopicAccuracyBarsProps = {
  topics: TopicSlice[];
  /** Cap on number of topics shown (default 6). */
  limit?: number;
  labels: {
    targetLine: string; // e.g. "Target 70%"
    empty: string;
  };
};

export function TopicAccuracyBars({ topics, limit = 6, labels }: TopicAccuracyBarsProps) {
  if (topics.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {labels.empty}
      </p>
    );
  }
  const rows = topics.slice(0, limit);
  return (
    <div className="space-y-2">
      {rows.map((t) => {
        const pct = Math.round(t.accuracy * 100);
        const tone =
          t.accuracy >= 0.7 ? "verified" : t.accuracy >= 0.5 ? "neutral" : "invalid";
        const barColor =
          tone === "verified"
            ? "var(--success)"
            : tone === "neutral"
              ? "var(--accent)"
              : "var(--warning)";
        return (
          <div key={t.topicKey} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span
                className="truncate font-medium"
                style={{ color: "var(--foreground)", maxWidth: "70%" }}
                title={t.label}
              >
                {t.label}
              </span>
              <span style={{ color: "var(--muted)" }}>
                {pct}% · {t.attemptCount}
              </span>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: "var(--surface-2)",
                position: "relative",
                overflow: "hidden"
              }}
            >
              {/* The 70% target gridline */}
              <div
                style={{
                  position: "absolute",
                  left: "70%",
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: "var(--border-strong)",
                  opacity: 0.6
                }}
                aria-hidden
              />
              <div
                style={{
                  width: `${Math.min(100, pct)}%`,
                  height: "100%",
                  background: barColor,
                  borderRadius: 999,
                  transition: "width 320ms ease"
                }}
                aria-hidden
              />
            </div>
          </div>
        );
      })}
      <p
        className="text-[10px] mt-1"
        style={{
          color: "var(--subtle)",
          fontFamily: "var(--font-mono-custom)",
          letterSpacing: "0.08em"
        }}
      >
        {labels.targetLine}
      </p>
    </div>
  );
}
