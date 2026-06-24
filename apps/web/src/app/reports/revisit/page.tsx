import { getServerSession } from "next-auth";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { appRouter } from "@/lib/trpc/router";
import { createTRPCContext } from "@/lib/trpc/server";
import {
  Card,
  Eyebrow,
  Section,
  SectionHeader,
  Tag
} from "@/components/ui";
import { ProblemStatement } from "@/components/problem-statement";
import { RouteProgressLink } from "@/components/route-progress-link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Wrong-answers archive — students open this page to look back at
 * the problems they got wrong or never finished across their last 5
 * distinct practice sets, grouped by set, with a one-click link to
 * re-attempt each problem inside the original run.
 *
 * Why a separate route (not just a tab on /reports):
 *   - The main /reports page already lists up to 8 problems to revisit
 *     in its "Question review" section, but that list is flat and
 *     scoped to the current report window. Students asked (docx
 *     feedback) for a per-set breakdown so they can do "ok, the last
 *     AMC paper — which 6 did I miss?" — which is a different
 *     interaction.
 *   - Keeps /reports fast: the archive iterates over every attempt in
 *     every run, which can be 100+ problems for an active student.
 *     Loading it on-demand keeps the daily reports load light.
 *
 * Data: reuses learningReport.getLatestReportInput (no runId) — which
 * already returns the user's last 5 distinct sets' attempts with the
 * fields we need. No new tRPC procedure. If the student has 0
 * completed runs we show an empty state.
 */
export default async function RevisitPage() {
  noStore();

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Freports%2Frevisit");
  }

  const caller = appRouter.createCaller(await createTRPCContext());
  const reportInput = await caller.learningReport.getLatestReportInput({});

  // Index attempts by practiceRunId so we can render per-set sections
  // without re-scanning the array N times.
  const attemptsByRunId = new Map<string, typeof reportInput.attempts>();
  for (const attempt of reportInput.attempts) {
    if (!attempt.practiceRunId) continue;
    const list = attemptsByRunId.get(attempt.practiceRunId) ?? [];
    list.push(attempt);
    attemptsByRunId.set(attempt.practiceRunId, list);
  }

  const hasAnyRuns = reportInput.recentRuns.length > 0;

  return (
    <main className="motion-rise">
      <Section tight className="pt-4 md:pt-6">
        <div className="hero-panel">
          <div className="flex flex-col gap-4">
            <Eyebrow>Wrong-answers archive</Eyebrow>
            <h1
              className="display-headline"
              style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
            >
              <span className="florid florid-gradient">Problems to revisit</span>
            </h1>
            <p className="display-lede">
              Your wrong and unfinished problems from your most recent practice
              sets, grouped by set. Click any problem to retry it.
            </p>
            <div>
              <RouteProgressLink className="btn-secondary" href="/reports">
                ← Back to report
              </RouteProgressLink>
            </div>
          </div>
        </div>
      </Section>

      {!hasAnyRuns ? (
        <Section tight>
          <Card>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              You have not completed any practice sets yet. Finish a set and
              this archive will fill up with problems you can revisit.
            </p>
          </Card>
        </Section>
      ) : null}

      {reportInput.recentRuns.map((run, runIdx) => {
        const runAttempts = attemptsByRunId.get(run.runId) ?? [];
        // Wrong + unfinished only. We surface DRAFT (never submitted)
        // separately from SUBMITTED-but-incorrect because the student's
        // intent is different — DRAFT means "I gave up", SUBMITTED-but-
        // wrong means "I tried and missed".
        const toRevisit = runAttempts
          .filter(
            (attempt) =>
              attempt.status === "DRAFT" ||
              (attempt.status === "SUBMITTED" && !attempt.isCorrect)
          )
          .sort((a, b) => a.problem.number - b.problem.number);

        return (
          <Section key={run.runId} tight>
            <SectionHeader
              eyebrow={`Set ${runIdx + 1} of ${reportInput.recentRuns.length}`}
              title={run.problemSetTitle}
              lede={
                run.problemSetLabel
                  ? `${run.problemSetLabel} · completed ${new Date(run.completedAt).toLocaleDateString()}`
                  : `Completed ${new Date(run.completedAt).toLocaleDateString()}`
              }
            />

            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <span
                className="rounded-full border px-3 py-1"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--muted)"
                }}
              >
                Accuracy {Math.round(run.accuracy * 100)}%
              </span>
              <span
                className="rounded-full border px-3 py-1"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--muted)"
                }}
              >
                {run.totalCorrect}/{run.totalSubmitted} correct
              </span>
              {run.hintUsedCount > 0 ? (
                <span
                  className="rounded-full border px-3 py-1"
                  style={{
                    background: "var(--surface-2)",
                    borderColor: "var(--border)",
                    color: "var(--muted)"
                  }}
                >
                  {run.hintUsedCount} hint{run.hintUsedCount === 1 ? "" : "s"} used
                </span>
              ) : null}
            </div>

            {toRevisit.length === 0 ? (
              <Card className="mt-6">
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Nothing to revisit for this set — you submitted every problem
                  correctly. Nice work.
                </p>
              </Card>
            ) : (
              <div className="mt-6 flex flex-col gap-3">
                {toRevisit.map((attempt, idx) => (
                  <Card key={attempt.attemptId}>
                    <div
                      style={{
                        animation: `rise-in 280ms cubic-bezier(0.2, 0.7, 0.2, 1) ${idx * 50}ms both`
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2" style={{ minWidth: 0, flex: 1 }}>
                          <h3
                            className="text-base font-semibold"
                            style={{ color: "var(--foreground-strong)" }}
                          >
                            Problem {attempt.problem.number}
                          </h3>
                          <ProblemStatement
                            statement={attempt.problem.statement}
                            statementFormat={attempt.problem.statementFormat}
                            compact
                            className="text-sm leading-6"
                          />
                        </div>
                        <Tag
                          status={
                            attempt.status === "DRAFT" ? "uncertain" : "invalid"
                          }
                        >
                          {attempt.status === "DRAFT"
                            ? "⊘ Unfinished"
                            : "✗ Incorrect"}
                        </Tag>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <div
                          className="flex flex-col gap-1"
                          style={{
                            padding: "10px 14px",
                            background: "var(--surface-2)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-md)",
                            flex: "1 1 240px"
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
                            Your answer
                          </p>
                          <p
                            className="text-sm"
                            style={{ color: "var(--foreground)" }}
                          >
                            {attempt.submittedAnswer?.trim() || "No answer"}
                          </p>
                        </div>
                        <RouteProgressLink
                          className="btn-primary"
                          href={`/problems/${encodeURIComponent(attempt.problemId)}?runId=${encodeURIComponent(run.runId)}`}
                        >
                          Try again →
                        </RouteProgressLink>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Section>
        );
      })}
    </main>
  );
}
