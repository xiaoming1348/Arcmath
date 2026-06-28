import { getServerSession } from "next-auth";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { isPlatformOperator } from "@/lib/platform-operator";
import { Card, Eyebrow, Metric, Section, Tag } from "@/components/ui";

/**
 * /admin/ocr-stats — OCR effectiveness dashboard (Sprint 3).
 *
 * Powers the "is GPT-4o vision good enough, or do we need Mathpix?"
 * decision. Reads from OcrCallLog (one row per call, populated by
 * recordOcrCall in ocr-quota.ts).
 *
 * Access: User.role === "ADMIN" only. Bilingual users can read the
 * raw numbers; this is a platform-staff tool, not a teacher-facing
 * one, so it stays English to avoid the i18n overhead for what's
 * effectively a debugging surface.
 *
 * MVP scope:
 *   - Lifetime totals (calls, success rate, high-confidence rate, unique users)
 *   - Daily call volume, last 14 days (hand-rolled SVG bar chart)
 *   - Confidence distribution (high / medium / low / none / null)
 *   - Recent 10 failed calls (for debugging API health vs prompt issues)
 *
 * Out of scope for MVP (add when needed):
 *   - Top users / quota hogs — privacy review needed
 *   - OCR-step grading pass rate — requires join via problemAttemptId
 *     into ProblemAttempt + the grading outcome, deferred
 *   - Per-confidence acceptance rate (how often the user edited the
 *     OCR'd LaTeX before save) — requires another telemetry table
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAYS_WINDOW = 14;

function formatPct(num: number, denom: number): string {
  if (denom === 0) return "—";
  return `${Math.round((num / denom) * 100)}%`;
}

export default async function OcrStatsPage() {
  noStore();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fadmin%2Focr-stats");
  }
  // Platform-operator gate (NOT User.role). User.role is org-internal;
  // platform-admin pages read the PLATFORM_OPERATOR_EMAILS env var.
  if (!isPlatformOperator(session.user.email)) {
    redirect("/unauthorized");
  }

  // ---------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------
  // We hit the table 4 ways. Each is bounded — even at 10k calls/month
  // this stays sub-100ms because of the (createdAt) and (userId, createdAt)
  // indexes already in the migration.
  //
  // Prisma's `groupBy` returns `_count: { _all: number }` shapes; the
  // ocrCallLog model gets generated at deploy time by `prisma generate`
  // in deploy.sh. Sandbox tsc will complain about model shapes that
  // aren't in the cached client — that's expected (see CLAUDE.md addendum C).

  const windowStart = new Date(Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000);

  const [
    totalCount,
    successCount,
    highConfCount,
    uniqueUsers,
    confidenceBuckets,
    perDay,
    recentFailures
  ] = await Promise.all([
    prisma.ocrCallLog.count(),
    prisma.ocrCallLog.count({ where: { succeeded: true } }),
    prisma.ocrCallLog.count({ where: { topConfidence: "high" } }),
    prisma.ocrCallLog
      .findMany({ select: { userId: true }, distinct: ["userId"] })
      .then((rows) => rows.length),
    prisma.ocrCallLog.groupBy({
      by: ["topConfidence"],
      _count: { _all: true }
    }),
    // Per-day counts in the window. We pull all rows in the window and
    // bucket in TS — at 14 days × ~hundreds-of-calls/day this is cheap.
    // Switching to a $queryRaw with date_trunc is a future optimization
    // if/when volume grows past ~10k/day.
    prisma.ocrCallLog.findMany({
      where: { createdAt: { gte: windowStart } },
      select: { createdAt: true, succeeded: true }
    }),
    prisma.ocrCallLog.findMany({
      where: { succeeded: false },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        kind: true,
        userId: true,
        problemAttemptId: true
      }
    })
  ]);

  // Bucket perDay rows into UTC days, oldest → newest.
  const dayLabels: string[] = [];
  const dayCounts: number[] = [];
  const dayFailures: number[] = [];
  for (let i = DAYS_WINDOW - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dayLabels.push(key.slice(5)); // "MM-DD"
    dayCounts.push(0);
    dayFailures.push(0);
  }
  for (const row of perDay) {
    const key = row.createdAt.toISOString().slice(0, 10);
    const idx = dayLabels.indexOf(key.slice(5));
    if (idx === -1) continue;
    dayCounts[idx] += 1;
    if (!row.succeeded) dayFailures[idx] += 1;
  }

  const maxDayCount = Math.max(1, ...dayCounts);

  // Build a stable confidence-bucket map (so we render in a fixed order
  // even when some buckets have zero rows).
  type ConfKey = "high" | "medium" | "low" | "none" | "null";
  const confMap: Record<ConfKey, number> = {
    high: 0,
    medium: 0,
    low: 0,
    none: 0,
    null: 0
  };
  for (const b of confidenceBuckets) {
    const key = (b.topConfidence ?? "null") as ConfKey;
    if (key in confMap) confMap[key] = b._count._all;
  }
  const confTotal = Object.values(confMap).reduce((a, b) => a + b, 0);

  // ---------------------------------------------------------------------
  // SVG bar chart for daily volume.
  // Same dimensions as progress-trend-chart so they line up visually.
  // ---------------------------------------------------------------------
  const W = 560;
  const H = 220;
  const PAD = { top: 16, right: 16, bottom: 36, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const barGap = 4;
  const barW = Math.max(2, (innerW - barGap * (DAYS_WINDOW - 1)) / DAYS_WINDOW);

  return (
    <main className="motion-rise mx-auto max-w-6xl px-6 py-12 space-y-10">
      <header className="hero-panel space-y-3">
        <Eyebrow>Admin · OCR telemetry</Eyebrow>
        <h1
          className="display-headline"
          style={{ fontSize: "clamp(1.8rem, 3.2vw, 2.4rem)" }}
        >
          <span className="florid florid-gradient" style={{ fontSize: "1.05em" }}>
            OCR
          </span>{" "}
          effectiveness dashboard
        </h1>
        <p className="display-lede" style={{ fontSize: 14 }}>
          Aggregated from <code style={{ fontFamily: "var(--font-mono-custom)" }}>OcrCallLog</code>.
          One row per call (Sprint 1 single-step + Sprint 2 multi-step). Image bytes
          and OCR&apos;d LaTeX are <em>not</em> stored.
        </p>
      </header>

      {/* Lifetime metric cards */}
      <Section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <Metric label="Total calls (all-time)" value={totalCount.toLocaleString()} />
          </Card>
          <Card>
            <Metric
              label="Success rate"
              value={formatPct(successCount, totalCount)}
              trend={`${successCount.toLocaleString()} succeeded`}
            />
          </Card>
          <Card>
            <Metric
              label="High-confidence rate"
              value={formatPct(highConfCount, successCount)}
              trend={`of successful calls`}
            />
          </Card>
          <Card>
            <Metric label="Unique users" value={uniqueUsers.toLocaleString()} />
          </Card>
        </div>
      </Section>

      {/* Daily volume chart */}
      <Section>
        <h2
          className="text-xl font-semibold mb-4"
          style={{ color: "var(--foreground)" }}
        >
          Daily call volume — last {DAYS_WINDOW} days
        </h2>
        {totalCount === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No OCR calls recorded yet.
          </p>
        ) : (
          <Card>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label="Daily OCR call volume"
              style={{ width: "100%", height: "auto" }}
            >
              {/* Y-axis gridlines at 25/50/75/100% of max */}
              {[0.25, 0.5, 0.75, 1].map((frac) => {
                const y = PAD.top + innerH * (1 - frac);
                const val = Math.round(maxDayCount * frac);
                return (
                  <g key={frac}>
                    <line
                      x1={PAD.left}
                      x2={PAD.left + innerW}
                      y1={y}
                      y2={y}
                      stroke="var(--border)"
                      strokeDasharray="2 4"
                    />
                    <text
                      x={PAD.left - 6}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="var(--muted)"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}
              {/* Bars */}
              {dayCounts.map((count, i) => {
                const h = (count / maxDayCount) * innerH;
                const x = PAD.left + i * (barW + barGap);
                const y = PAD.top + innerH - h;
                const failed = dayFailures[i];
                const failH = (failed / maxDayCount) * innerH;
                return (
                  <g key={i}>
                    {/* Total bar */}
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={h}
                      fill="var(--accent)"
                      opacity={0.85}
                    />
                    {/* Failed overlay (red) on top */}
                    {failed > 0 && (
                      <rect
                        x={x}
                        y={PAD.top + innerH - failH}
                        width={barW}
                        height={failH}
                        fill="#dc2626"
                        opacity={0.9}
                      />
                    )}
                    {/* X-axis label every 2 days to avoid overlap */}
                    {i % 2 === 0 && (
                      <text
                        x={x + barW / 2}
                        y={H - 12}
                        textAnchor="middle"
                        fontSize="10"
                        fill="var(--muted)"
                      >
                        {dayLabels[i]}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              Blue = total calls. Red overlay = failed calls (API/network/parse).
            </p>
          </Card>
        )}
      </Section>

      {/* Confidence distribution */}
      <Section>
        <h2
          className="text-xl font-semibold mb-4"
          style={{ color: "var(--foreground)" }}
        >
          Confidence distribution
        </h2>
        <Card>
          <table className="w-full text-sm">
            <thead style={{ color: "var(--muted)" }}>
              <tr className="text-left">
                <th className="py-2">Bucket</th>
                <th className="py-2 text-right">Count</th>
                <th className="py-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {(["high", "medium", "low", "none", "null"] as const).map((key) => {
                const count = confMap[key];
                const tagStatus =
                  key === "high"
                    ? "verified"
                    : key === "medium"
                      ? "uncertain"
                      : key === "low" || key === "none"
                        ? "invalid"
                        : "neutral";
                const label = key === "null" ? "(failed / no data)" : key;
                return (
                  <tr
                    key={key}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="py-2">
                      <Tag status={tagStatus}>{label}</Tag>
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "var(--foreground)" }}
                    >
                      {count.toLocaleString()}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "var(--muted)" }}
                    >
                      {formatPct(count, confTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </Section>

      {/* Recent failures */}
      <Section>
        <h2
          className="text-xl font-semibold mb-4"
          style={{ color: "var(--foreground)" }}
        >
          Recent failed calls
        </h2>
        {recentFailures.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No failures recorded. Either OCR is healthy, or no calls have been
            made yet.
          </p>
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead style={{ color: "var(--muted)" }}>
                <tr className="text-left">
                  <th className="py-2">When</th>
                  <th className="py-2">Kind</th>
                  <th className="py-2">User ID</th>
                  <th className="py-2">Attempt ID</th>
                </tr>
              </thead>
              <tbody>
                {recentFailures.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td
                      className="py-2 font-mono text-xs"
                      style={{ color: "var(--foreground)" }}
                    >
                      {r.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                    </td>
                    <td className="py-2" style={{ color: "var(--foreground)" }}>
                      {r.kind}
                    </td>
                    <td
                      className="py-2 font-mono text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      {r.userId.slice(0, 8)}…
                    </td>
                    <td
                      className="py-2 font-mono text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      {r.problemAttemptId ? `${r.problemAttemptId.slice(0, 8)}…` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>
    </main>
  );
}
