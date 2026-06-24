/**
 * Per-set accuracy trend line for the latest learning report.
 *
 * Inline SVG, no chart-library dependency (per CLAUDE.md addendum E:
 * one fewer thing to audit + install on deploy). Up to 5 dots, the
 * most-recent set on the right end. Each dot has a <title> tag so the
 * student can mouse over to see the set label + accuracy.
 *
 * If the student has 0–1 completed sets we don't render the chart at
 * all — a single dot isn't a trend, and the empty-state copy on the
 * page covers it.
 */
type RunPoint = {
  runId: string;
  problemSetLabel: string | null;
  problemSetTitle: string;
  completedAt: string;
  accuracy: number;
  totalSubmitted: number;
  totalCorrect: number;
};

type Props = {
  runs: RunPoint[];
};

export function SetTrendChart({ runs }: Props) {
  if (runs.length < 2) {
    return null;
  }

  // Server input is most-recent-first; chart reads left → right as
  // oldest → newest, so reverse for plotting.
  const ordered = [...runs].reverse();

  const viewBoxW = 720;
  const viewBoxH = 220;
  const padL = 44;
  const padR = 24;
  const padT = 20;
  const padB = 48;

  const plotW = viewBoxW - padL - padR;
  const plotH = viewBoxH - padT - padB;

  const xFor = (i: number) =>
    padL + (ordered.length === 1 ? plotW / 2 : (i / (ordered.length - 1)) * plotW);
  const yFor = (acc: number) => padT + plotH - acc * plotH;

  const linePath = ordered
    .map((run, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(run.accuracy).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
      width="100%"
      height="220"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Accuracy across recent sets"
    >
      {/* Gridlines at 0 / 25 / 50 / 75 / 100 % */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = yFor(frac);
        return (
          <g key={frac}>
            <line
              x1={padL}
              x2={viewBoxW - padR}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeWidth={frac === 0 || frac === 1 ? 1 : 0.5}
              strokeDasharray={frac === 0 || frac === 1 ? "" : "3 3"}
            />
            <text
              x={padL - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--muted)"
              fontFamily="var(--font-mono-custom, monospace)"
            >
              {Math.round(frac * 100)}%
            </text>
          </g>
        );
      })}

      {/* Trend line */}
      <path
        d={linePath}
        fill="none"
        stroke="var(--accent-strong, #2b6fff)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots + x-axis labels. Label = set label if present (e.g.
          "AMC 10A 2023"), else first ~12 chars of the title. */}
      {ordered.map((run, i) => {
        const cx = xFor(i);
        const cy = yFor(run.accuracy);
        const label = (run.problemSetLabel ?? run.problemSetTitle).trim();
        // Two-line truncation for narrow chart slots
        const labelShort =
          label.length > 16 ? `${label.slice(0, 15)}…` : label;
        return (
          <g key={run.runId}>
            <circle
              cx={cx}
              cy={cy}
              r={5}
              fill="var(--accent-strong, #2b6fff)"
            >
              <title>{`${label} — ${Math.round(run.accuracy * 100)}% (${run.totalCorrect}/${run.totalSubmitted})`}</title>
            </circle>
            <circle
              cx={cx}
              cy={cy}
              r={11}
              fill="var(--accent-strong, #2b6fff)"
              fillOpacity={0.12}
            />
            <text
              x={cx}
              y={cy - 14}
              textAnchor="middle"
              fontSize="12"
              fontWeight={600}
              fill="var(--foreground-strong)"
              fontFamily="var(--font-mono-custom, monospace)"
            >
              {Math.round(run.accuracy * 100)}%
            </text>
            <text
              x={cx}
              y={viewBoxH - padB + 18}
              textAnchor="middle"
              fontSize="11"
              fill="var(--muted)"
            >
              {labelShort}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
