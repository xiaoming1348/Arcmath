/**
 * Per-topic sparklines for the latest learning report.
 *
 * Each row is one topic with a tiny SVG line plotting per-attempt
 * outcome (1 = correct, 0 = incorrect) over time, rendered as a
 * smoothed running accuracy. Lets a student see at a glance that
 * "Algebra is trending up, Geometry is flat" without scrolling
 * through 5 sets of problem-by-problem detail.
 *
 * Smoothing: instead of plotting raw 1/0, plot the running window
 * accuracy (last min(5, k) attempts). A single bad answer doesn't
 * spike the chart; sustained patterns show as multi-point movements.
 *
 * Renders only when there are >= 3 topics with >= 5 attempts each
 * (filtering is upstream on the server side via TOPIC_TREND_MIN_ATTEMPTS;
 * the client just renders whatever the server sent — no extra logic
 * needed here).
 */
type TopicTrendPoint = {
  attemptId: string;
  isCorrect: boolean;
  createdAt: string;
};

type TopicTrend = {
  topicKey: string;
  totalAttempts: number;
  totalCorrect: number;
  accuracy: number;
  points: TopicTrendPoint[];
};

type Props = {
  trends: TopicTrend[];
  formatTopicLabel: (topicKey: string) => string;
};

const SPARK_W = 240;
const SPARK_H = 60;
const SPARK_PAD = 6;

function rollingAccuracy(points: TopicTrendPoint[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const start = Math.max(0, i - window + 1);
    const slice = points.slice(start, i + 1);
    const correct = slice.filter((p) => p.isCorrect).length;
    result.push(correct / slice.length);
  }
  return result;
}

function buildPath(values: number[]): string {
  if (values.length === 0) return "";
  const plotW = SPARK_W - 2 * SPARK_PAD;
  const plotH = SPARK_H - 2 * SPARK_PAD;
  if (values.length === 1) {
    const x = SPARK_PAD + plotW / 2;
    const y = SPARK_PAD + plotH - values[0] * plotH;
    return `M${x.toFixed(1)},${y.toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return values
    .map((v, i) => {
      const x = SPARK_PAD + (i / (values.length - 1)) * plotW;
      const y = SPARK_PAD + plotH - v * plotH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function TopicSparklines({ trends, formatTopicLabel }: Props) {
  if (trends.length < 3) {
    return null;
  }
  // Sliding window of 5 attempts gives a stable signal — long enough
  // to dampen a single wrong answer, short enough to react to a real
  // change in trend.
  const window = 5;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {trends.map((trend) => {
        const rolling = rollingAccuracy(trend.points, window);
        const latest = rolling.at(-1) ?? 0;
        const earliest = rolling[0] ?? 0;
        const delta = latest - earliest;
        const deltaPct = Math.round(delta * 100);
        const trendColor =
          delta > 0.05
            ? "var(--success, #16a34a)"
            : delta < -0.05
              ? "#dc2626"
              : "var(--muted, #64748b)";
        return (
          <div
            key={trend.topicKey}
            style={{
              padding: 14,
              background: "var(--surface-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)"
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--foreground-strong)" }}
              >
                {formatTopicLabel(trend.topicKey)}
              </p>
              <span
                className="text-[11px]"
                style={{
                  color: trendColor,
                  fontFamily: "var(--font-mono-custom, monospace)"
                }}
              >
                {delta > 0 ? "+" : ""}
                {deltaPct}%
              </span>
            </div>
            <p
              className="text-[11px]"
              style={{
                color: "var(--muted)",
                fontFamily: "var(--font-mono-custom, monospace)"
              }}
            >
              {trend.totalCorrect}/{trend.totalAttempts} ·{" "}
              {Math.round(trend.accuracy * 100)}% overall
            </p>
            <svg
              viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
              width="100%"
              height={SPARK_H}
              preserveAspectRatio="none"
              className="mt-2"
              aria-label={`${formatTopicLabel(trend.topicKey)} accuracy trend`}
            >
              <line
                x1={SPARK_PAD}
                x2={SPARK_W - SPARK_PAD}
                y1={SPARK_PAD + (SPARK_H - 2 * SPARK_PAD) / 2}
                y2={SPARK_PAD + (SPARK_H - 2 * SPARK_PAD) / 2}
                stroke="var(--border)"
                strokeWidth={0.5}
                strokeDasharray="2 3"
              />
              <path
                d={buildPath(rolling)}
                fill="none"
                stroke={trendColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
