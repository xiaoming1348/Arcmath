import { getServerSession } from "next-auth";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import {
  resolveFeedbackLocaleForUser,
  resolveLocale
} from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";
import {
  buildStudentProgressReport,
  isSnapshotDue,
  selectDifficultyTargetForTopic,
  startOfIsoWeek,
  type DifficultyTarget,
  type ProgressAttemptInput,
  type RecommendedProblem
} from "@/lib/ai/student-progress-report";
import { Card, Eyebrow, Metric, Section, Tag } from "@/components/ui";
import {
  AccuracyTrendChart,
  TopicAccuracyBars
} from "@/components/progress-trend-chart";
import { TopicMasteryGrid } from "@/components/topic-mastery-grid";
import { RecommendedProblemsList } from "@/components/recommended-problems-list";

/**
 * /me/progress — student-facing lifetime progress report.
 *
 * This is distinct from /reports, which is per-PracticeRun. This page
 * aggregates every problem attempt the user has ever made:
 *
 *   - Lifetime totals (problems attempted, accuracy, time spent)
 *   - Per-topic strengths/weaknesses with concrete numbers
 *   - Per-difficulty accuracy breakdown
 *   - Per-contest performance
 *   - An LLM-generated personalized study plan (uses feedbackLocale)
 *
 * Phase A (this commit): synchronous compute on every page load, no
 * snapshot persistence, no charts. Phase B will add weekly snapshots
 * + recharts visualizations + "this week vs last week" deltas. Phase C
 * will surface concrete next-problem recommendations.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** Compact a problem statement for the recommended-problems card.
 *  Keeps LaTeX/Markdown intact but caps at ~110 chars so the cards
 *  stay scannable. */
function makeStatementSnippet(statement: string | null): string {
  const text = (statement ?? "").replace(/\s+/g, " ").trim();
  if (text.length === 0) return "(no statement)";
  if (text.length <= 110) return text;
  return `${text.slice(0, 107)}…`;
}

export default async function MyProgressPage() {
  noStore();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fme%2Fprogress");
  }
  const userId = session.user.id;

  const [uiLocale, feedbackLocale, attemptsRaw, snapshotsRaw] = await Promise.all([
    resolveLocale(),
    resolveFeedbackLocaleForUser(userId),
    prisma.problemAttempt.findMany({
      where: { userId, status: "SUBMITTED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        isCorrect: true,
        hintsUsedCount: true,
        createdAt: true,
        submittedAt: true,
        problem: {
          select: {
            topicKey: true,
            difficultyBand: true,
            problemSet: { select: { contest: true } }
          }
        }
      }
    }),
    // Phase B: pull last 12 weekly snapshots for the trend chart.
    // Safe-cast through `any` because the generated Prisma client may
    // be a sandbox stub; the real type exists after `pnpm prisma generate`.
    (prisma as unknown as {
      studentProgressSnapshot: {
        findMany: (args: unknown) => Promise<
          Array<{
            windowEnd: Date;
            totalAttempts: number;
            totalCorrect: number;
            accuracy: number;
          }>
        >;
      };
    }).studentProgressSnapshot.findMany({
      where: { userId },
      orderBy: { windowEnd: "asc" },
      take: 12,
      select: {
        windowEnd: true,
        totalAttempts: true,
        totalCorrect: true,
        accuracy: true
      }
    })
  ]);
  const t = translator(uiLocale);

  const attempts: ProgressAttemptInput[] = attemptsRaw.map((a) => ({
    id: a.id,
    isCorrect: a.isCorrect,
    hintsUsedCount: a.hintsUsedCount,
    createdAt: a.createdAt,
    submittedAt: a.submittedAt,
    problem: {
      topicKey: a.problem.topicKey,
      difficultyBand: a.problem.difficultyBand,
      problemSet: { contest: a.problem.problemSet.contest }
    }
  }));

  const report = await buildStudentProgressReport({
    userId,
    attempts,
    locale: feedbackLocale,
    snapshots: snapshotsRaw
  });

  // Phase B: write a fresh snapshot when the current week is missing or
  // the latest snapshot is > 6 days old. Fire-and-forget — we don't want
  // a write failure to break the page render.
  const latestSnapshot = snapshotsRaw[snapshotsRaw.length - 1];
  const now = new Date();
  if (
    report.totalAttempts > 0 &&
    isSnapshotDue(latestSnapshot?.windowEnd ?? null, now)
  ) {
    const windowStart = startOfIsoWeek(now);
    const windowEnd = new Date(windowStart);
    windowEnd.setUTCDate(windowStart.getUTCDate() + 7);
    const snapshotData = {
      userId,
      windowStart,
      windowEnd,
      totalAttempts: report.totalAttempts,
      totalCorrect: report.totalCorrect,
      accuracy: report.lifetimeAccuracy,
      timeSpentSeconds: report.totalTimeSpentMinutes * 60,
      hintsUsed: report.totalHintsUsed,
      topicBreakdown: report.byTopic.slice(0, 20) as unknown,
      difficultyBreakdown: report.byDifficulty as unknown,
      reportJson: {
        // Slim copy: omit the LLM plan so we don't bloat the row.
        firstAttemptAt: report.firstAttemptAt,
        lastAttemptAt: report.lastAttemptAt,
        activeDaysLast14: report.activeDaysLast14,
        topStrengths: report.topStrengths,
        topWeaknesses: report.topWeaknesses
      } as unknown
    };
    void (prisma as unknown as {
      studentProgressSnapshot: {
        upsert: (args: unknown) => Promise<unknown>;
      };
    }).studentProgressSnapshot
      .upsert({
        where: { userId_windowStart: { userId, windowStart } },
        create: snapshotData,
        update: snapshotData
      })
      .catch((err: unknown) => {
        console.warn("[progress] snapshot upsert failed", err);
      });
  }

  // ---------- Phase C-2 + C-3: recommend next problems ----------
  // Strategy: for each weakness topic (up to 3), pick the right
  // difficulty target via selectDifficultyTargetForTopic, then query
  // for at most 2 problems per topic that the student hasn't attempted
  // yet. Cap the final list at 6 to keep the section scannable.
  let recommendedProblems: RecommendedProblem[] = [];
  if (report.topWeaknesses.length > 0) {
    const attemptedProblemIds = new Set(attemptsRaw.map((a) => a.id));
    // attemptsRaw is per-attempt; we need the set of problemIds the
    // user has actually touched, not attempt IDs.
    const attemptedProblemIdsFromProblems = await prisma.problemAttempt.findMany({
      where: { userId },
      select: { problemId: true }
    });
    for (const row of attemptedProblemIdsFromProblems) {
      attemptedProblemIds.add(row.problemId);
    }

    // Build a "topic → difficulty target" map up front so we don't
    // re-compute inside the loop.
    const topicTarget = new Map<string, DifficultyTarget>(
      report.topWeaknesses.map((t) => [
        t.topicKey,
        selectDifficultyTargetForTopic(
          { accuracy: t.accuracy, attemptCount: t.attemptCount },
          report.byDifficulty
        )
      ])
    );

    for (const weakness of report.topWeaknesses) {
      const target = topicTarget.get(weakness.topicKey) ?? "MEDIUM";
      // Pull up to 4 candidates so we have headroom for filtering
      // out attempted problems.
      const candidates = await prisma.problem.findMany({
        where: {
          topicKey: weakness.topicKey,
          difficultyBand: target,
          id: { notIn: Array.from(attemptedProblemIds) },
          problemSet: {
            status: "PUBLISHED",
            category: { in: ["REAL_EXAM", "TOPIC_PRACTICE"] }
          }
        },
        orderBy: [{ number: "asc" }],
        take: 4,
        select: {
          id: true,
          number: true,
          statement: true,
          difficultyBand: true,
          problemSet: {
            select: {
              id: true,
              title: true,
              contest: true,
              year: true
            }
          }
        }
      });

      for (const c of candidates.slice(0, 2)) {
        if (recommendedProblems.length >= 6) break;
        const accuracyPct = Math.round(weakness.accuracy * 100);
        const reason = uiLocale === "zh"
          ? `${weakness.label} 现在 ${accuracyPct}% — 推一道 ${target} 难度往上推`
          : `You're at ${accuracyPct}% on ${weakness.label} — pushing one ${target} problem to consolidate`;
        recommendedProblems.push({
          problemId: c.id,
          problemSetId: c.problemSet.id,
          problemSetTitle: c.problemSet.title,
          contest: c.problemSet.contest,
          year: c.problemSet.year,
          problemNumber: c.number,
          statementSnippet: makeStatementSnippet(c.statement),
          topicLabel: weakness.label,
          difficultyBand: (c.difficultyBand as DifficultyTarget) ?? target,
          reason
        });
      }
      if (recommendedProblems.length >= 6) break;
    }
  }

  // ---------- empty state ----------
  if (report.totalAttempts === 0) {
    return (
      <main className="motion-rise space-y-4">
        <Section className="pt-6">
          <div className="hero-panel">
            <div className="flex flex-col gap-4">
              <Eyebrow>{t("progress.eyebrow")}</Eyebrow>
              <h1 className="display-headline" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}>
                <span className="florid florid-gradient">{t("progress.title")}</span>
              </h1>
              <p className="display-lede">{t("progress.empty_lede")}</p>
              <div>
                <a href="/problems" className="btn-primary">
                  {t("progress.empty_cta")}
                </a>
              </div>
            </div>
          </div>
        </Section>
      </main>
    );
  }

  // ---------- main report ----------
  return (
    <main className="motion-rise space-y-4">
      {/* === HERO + KEY METRICS === */}
      <Section className="pt-6">
        <div className="hero-panel">
          <div className="flex flex-col gap-5">
            <Eyebrow>{t("progress.eyebrow")}</Eyebrow>
            <h1 className="display-headline" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}>
              <span className="florid florid-gradient">{t("progress.title")}</span>
            </h1>
            <p className="display-lede">
              {t("progress.hero_lede", {
                days: String(report.daysSinceFirstAttempt),
                attempts: String(report.totalAttempts)
              })}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label={t("progress.metric_attempts")}
                value={String(report.totalAttempts)}
              />
              <Metric
                label={t("progress.metric_accuracy")}
                value={formatPct(report.lifetimeAccuracy)}
              />
              <Metric
                label={t("progress.metric_time")}
                value={formatMinutes(report.totalTimeSpentMinutes)}
              />
              <Metric
                label={t("progress.metric_streak")}
                value={`${report.activeDaysLast14}/14`}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* === PHASE B: TREND CHART + WEEK-OVER-WEEK === */}
      {report.weeklyTrend.length >= 2 ? (
        <Section>
          <Card className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <Eyebrow>{t("progress.trend_eyebrow")}</Eyebrow>
                <h2 className="text-lg font-semibold text-slate-900">
                  {t("progress.trend_title")}
                </h2>
              </div>
              {report.weekOverWeek ? (
                <div className="flex flex-col items-end text-right">
                  <span className="text-[11px]" style={{ color: "var(--subtle)" }}>
                    {t("progress.wow_label")}
                  </span>
                  <span
                    className="text-base font-semibold"
                    style={{
                      color:
                        report.weekOverWeek.accuracyDeltaPP >= 0
                          ? "var(--success)"
                          : "var(--warning)"
                    }}
                  >
                    {report.weekOverWeek.accuracyDeltaPP >= 0 ? "+" : ""}
                    {report.weekOverWeek.accuracyDeltaPP.toFixed(1)} pp
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                    {t("progress.wow_attempts", {
                      curr: String(report.weekOverWeek.attemptsThisWeek),
                      prev: String(report.weekOverWeek.attemptsLastWeek)
                    })}
                  </span>
                </div>
              ) : null}
            </div>
            <AccuracyTrendChart
              points={report.weeklyTrend}
              locale={uiLocale}
              labels={{
                title: t("progress.trend_title"),
                yAxis: t("progress.trend_y_axis"),
                empty: t("progress.trend_empty")
              }}
            />
            <p className="text-xs" style={{ color: "var(--subtle)" }}>
              {t("progress.trend_caption")}
            </p>
          </Card>
        </Section>
      ) : null}

      {/* === TOPIC ACCURACY BARS === */}
      {report.byTopic.length > 0 ? (
        <Section>
          <Card className="space-y-3">
            <Eyebrow>{t("progress.topic_bars_eyebrow")}</Eyebrow>
            <h2 className="text-lg font-semibold text-slate-900">
              {t("progress.topic_bars_title")}
            </h2>
            <TopicAccuracyBars
              topics={report.byTopic}
              labels={{
                targetLine: t("progress.topic_bars_target"),
                empty: t("progress.strengths_empty")
              }}
            />
          </Card>
        </Section>
      ) : null}

      {/* === PHASE C-2: RECOMMENDED NEXT PROBLEMS === */}
      {recommendedProblems.length > 0 ? (
        <Section>
          <Card className="space-y-3">
            <Eyebrow>{t("progress.recommend_eyebrow")}</Eyebrow>
            <h2 className="text-lg font-semibold text-slate-900">
              {t("progress.recommend_title")}
            </h2>
            <RecommendedProblemsList
              problems={recommendedProblems}
              labels={{
                eyebrow: t("progress.recommend_eyebrow"),
                title: t("progress.recommend_title"),
                empty: t("progress.recommend_empty"),
                help: t("progress.recommend_help"),
                difficulty: {
                  EASY: t("progress.difficulty_easy"),
                  MEDIUM: t("progress.difficulty_medium"),
                  HARD: t("progress.difficulty_hard")
                },
                openCta: t("progress.recommend_open_cta")
              }}
            />
          </Card>
        </Section>
      ) : null}

      {/* === PHASE C-1: TOPIC MASTERY GRID === */}
      {report.topicMastery.length > 0 ? (
        <Section>
          <Card className="space-y-3">
            <Eyebrow>{t("progress.mastery_eyebrow")}</Eyebrow>
            <h2 className="text-lg font-semibold text-slate-900">
              {t("progress.mastery_title")}
            </h2>
            <TopicMasteryGrid
              topics={report.topicMastery}
              labels={{
                levelNames: [
                  t("progress.mastery_level_0"),
                  t("progress.mastery_level_1"),
                  t("progress.mastery_level_2"),
                  t("progress.mastery_level_3"),
                  t("progress.mastery_level_4"),
                  t("progress.mastery_level_5")
                ],
                recommendation: {
                  explore: t("progress.mastery_rec_explore"),
                  review: t("progress.mastery_rec_review"),
                  progress: t("progress.mastery_rec_progress"),
                  advance: t("progress.mastery_rec_advance")
                },
                legend: t("progress.mastery_legend"),
                empty: t("progress.mastery_empty")
              }}
            />
          </Card>
        </Section>
      ) : null}

      {/* === LLM PERSONALIZED PLAN === */}
      {report.llmPlan ? (
        <Section>
          <Card
            className="space-y-3"
            style={{
              background: "var(--accent-soft)",
              border: "1.5px solid color-mix(in srgb, var(--accent) 30%, transparent)"
            }}
          >
            <Eyebrow>{t("progress.plan_eyebrow")}</Eyebrow>
            <p className="text-base text-slate-900" style={{ lineHeight: 1.7 }}>
              {report.llmPlan.summary}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div
                style={{
                  padding: 14,
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-card)",
                  border: "1px solid var(--border)"
                }}
              >
                <p
                  className="text-[11px] font-semibold uppercase"
                  style={{
                    color: "var(--success)",
                    letterSpacing: "0.12em",
                    fontFamily: "var(--font-mono-custom)"
                  }}
                >
                  {t("progress.plan_strength")}
                </p>
                <p className="mt-2 text-sm" style={{ color: "var(--foreground)", lineHeight: 1.6 }}>
                  {report.llmPlan.strengthNote}
                </p>
              </div>
              <div
                style={{
                  padding: 14,
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-card)",
                  border: "1px solid var(--border)"
                }}
              >
                <p
                  className="text-[11px] font-semibold uppercase"
                  style={{
                    color: "var(--warning)",
                    letterSpacing: "0.12em",
                    fontFamily: "var(--font-mono-custom)"
                  }}
                >
                  {t("progress.plan_weakness")}
                </p>
                <p className="mt-2 text-sm" style={{ color: "var(--foreground)", lineHeight: 1.6 }}>
                  {report.llmPlan.weaknessNote}
                </p>
              </div>
            </div>

            <div>
              <p
                className="text-[11px] font-semibold uppercase"
                style={{
                  color: "var(--accent-strong)",
                  letterSpacing: "0.12em",
                  fontFamily: "var(--font-mono-custom)"
                }}
              >
                {t("progress.plan_next_moves")}
              </p>
              <ol className="mt-2 space-y-2">
                {report.llmPlan.nextMoves.map((move, i) => (
                  <li
                    key={i}
                    className="flex gap-3"
                    style={{ color: "var(--foreground)" }}
                  >
                    <span
                      className="shrink-0 font-bold"
                      style={{
                        color: "var(--accent-strong)",
                        fontFamily: "var(--font-mono-custom)",
                        minWidth: 24
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm" style={{ lineHeight: 1.6 }}>
                      {move}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: "var(--radius-md)",
                background: "var(--surface-card)",
                border: "1px dashed var(--accent-strong)"
              }}
            >
              <p
                className="text-[11px] font-semibold uppercase"
                style={{
                  color: "var(--accent-strong)",
                  letterSpacing: "0.12em",
                  fontFamily: "var(--font-mono-custom)"
                }}
              >
                {t("progress.plan_milestone")}
              </p>
              <p
                className="mt-1 text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                {report.llmPlan.milestoneGoal}
              </p>
            </div>
          </Card>
        </Section>
      ) : null}

      {/* === BREAKDOWN ROW: TIME & HINT === */}
      <Section>
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="space-y-2">
            <Eyebrow>{t("progress.time_eyebrow")}</Eyebrow>
            <p className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
              {formatSeconds(report.avgTimePerAttemptSeconds)}
            </p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {t("progress.time_help")}
            </p>
          </Card>
          <Card className="space-y-2">
            <Eyebrow>{t("progress.hint_eyebrow")}</Eyebrow>
            <p className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
              {formatPct(report.hintReliance)}
            </p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {t("progress.hint_help", {
                avg: report.avgHintsPerAttempt.toFixed(1)
              })}
            </p>
          </Card>
          <Card className="space-y-2">
            <Eyebrow>{t("progress.cadence_eyebrow")}</Eyebrow>
            <p className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
              {report.activeDaysLast14} / 14
            </p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {t("progress.cadence_help")}
            </p>
          </Card>
        </div>
      </Section>

      {/* === STRENGTHS & WEAKNESSES === */}
      <Section>
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="space-y-3">
            <Eyebrow>{t("progress.strengths_eyebrow")}</Eyebrow>
            {report.topStrengths.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("progress.strengths_empty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {report.topStrengths.map((t2) => (
                  <li
                    key={t2.topicKey}
                    className="flex items-center justify-between gap-3"
                    style={{
                      padding: 12,
                      borderRadius: "var(--radius-md)",
                      background: "var(--success-soft)",
                      border: "1px solid color-mix(in srgb, var(--success) 28%, transparent)"
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                        {t2.label}
                      </span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {t2.attemptCount} {t("progress.attempts_word")} · {formatPct(t2.accuracy)}
                      </span>
                    </div>
                    <Tag status="verified">{formatPct(t2.accuracy)}</Tag>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-3">
            <Eyebrow>{t("progress.weaknesses_eyebrow")}</Eyebrow>
            {report.topWeaknesses.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("progress.weaknesses_empty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {report.topWeaknesses.map((t2) => (
                  <li
                    key={t2.topicKey}
                    className="flex items-center justify-between gap-3"
                    style={{
                      padding: 12,
                      borderRadius: "var(--radius-md)",
                      background: "var(--warning-soft)",
                      border: "1px solid color-mix(in srgb, var(--warning) 28%, transparent)"
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                        {t2.label}
                      </span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {t2.attemptCount} {t("progress.attempts_word")} ·{" "}
                        {formatPct(t2.accuracy)} ·{" "}
                        {t("progress.hints_per_attempt", {
                          n: t2.hintsPerAttempt.toFixed(1)
                        })}
                      </span>
                    </div>
                    <Tag status="invalid">{formatPct(t2.accuracy)}</Tag>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Section>

      {/* === BY DIFFICULTY === */}
      <Section>
        <Card className="space-y-3">
          <Eyebrow>{t("progress.difficulty_eyebrow")}</Eyebrow>
          <div className="grid gap-3 sm:grid-cols-3">
            {report.byDifficulty.map((d) => (
              <div
                key={d.difficultyBand}
                style={{
                  padding: 14,
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)"
                }}
              >
                <p
                  className="text-[11px] font-semibold uppercase"
                  style={{
                    color: "var(--subtle)",
                    letterSpacing: "0.12em",
                    fontFamily: "var(--font-mono-custom)"
                  }}
                >
                  {d.difficultyBand}
                </p>
                <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
                  {formatPct(d.accuracy)}
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {d.correctCount} / {d.attemptCount} {t("progress.attempts_word")}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      {/* === BY CONTEST === */}
      {report.byContest.length > 0 ? (
        <Section>
          <Card className="space-y-3">
            <Eyebrow>{t("progress.contest_eyebrow")}</Eyebrow>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--subtle)" }}>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase">
                    {t("progress.col_contest")}
                  </th>
                  <th className="py-2 text-right text-[11px] font-semibold uppercase">
                    {t("progress.col_attempts")}
                  </th>
                  <th className="py-2 text-right text-[11px] font-semibold uppercase">
                    {t("progress.col_accuracy")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.byContest.map((c) => (
                  <tr
                    key={c.contest}
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <td className="py-2 font-medium" style={{ color: "var(--foreground)" }}>
                      {c.contest}
                    </td>
                    <td className="py-2 text-right" style={{ color: "var(--muted)" }}>
                      {c.attemptCount}
                    </td>
                    <td className="py-2 text-right font-semibold" style={{ color: "var(--foreground)" }}>
                      {formatPct(c.accuracy)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      ) : null}

      {/* === FOOTER: link to per-run reports === */}
      <Section>
        <p className="text-xs" style={{ color: "var(--subtle)" }}>
          {t("progress.footer_hint")}{" "}
          <a href="/reports" style={{ color: "var(--accent-strong)" }}>
            {t("progress.footer_link")}
          </a>
        </p>
      </Section>
    </main>
  );
}
