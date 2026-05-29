import { getServerSession } from "next-auth";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { generateLearningReport } from "@/lib/ai/learning-report";
import { appRouter } from "@/lib/trpc/router";
import { createTRPCContext } from "@/lib/trpc/server";
import {
  Card,
  Eyebrow,
  Metric,
  Section,
  SectionHeader,
  Tag
} from "@/components/ui";
import { ProblemStatement } from "@/components/problem-statement";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatTopicLabel(topicKey: string): string {
  return topicKey
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function formatAnswerDisplay(value: string | null): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "No answer";
}

type ReportsPageProps = {
  searchParams: Promise<{
    runId?: string;
  }>;
};

/**
 * Learning report page — refreshed (2026-05-13) to the v3 design
 * system. Big hero metric (accuracy %) leads, outcome breakdown laid
 * out as Brilliant-style colored tiles, question review cards reuse
 * the tag data-status styling so VERIFIED/INVALID matches the rest
 * of the app.
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  noStore();
  const { runId } = await searchParams;

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=%2Freports");
  }

  if (runId) {
    await prisma.practiceRun.updateMany({
      where: {
        id: runId,
        userId: session.user.id,
        completedAt: null
      },
      data: {
        completedAt: new Date()
      }
    });
  }

  const caller = appRouter.createCaller(await createTRPCContext());
  const reportInput = await caller.learningReport.getLatestReportInput({
    runId: runId ?? undefined
  });
  const isRunScoped = reportInput.reportScope.type === "practice-run";
  const reportHeading = isRunScoped
    ? "Set Report"
    : "Your latest report";
  const reportDescription = isRunScoped
    ? `Based on your completed run for ${reportInput.reportScope.problemSetTitle ?? "this practice set"}${reportInput.reportScope.problemSetLabel ? ` · ${reportInput.reportScope.problemSetLabel}` : ""}.`
    : "Based on your most recent Hint Tutor attempts and hint usage.";

  if (reportInput.attempts.length === 0) {
    return (
      <main className="motion-rise">
        <Section tight className="pt-4 md:pt-6">
          <div className="hero-panel">
            <div className="flex flex-col gap-4">
              <Eyebrow>AI Learning Report</Eyebrow>
              <h1
                className="display-headline"
                style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
              >
                <span className="florid florid-gradient">{reportHeading}</span>
              </h1>
              <p className="display-lede">
                {isRunScoped
                  ? "This practice run does not have any recorded attempts yet."
                  : "Complete a few Hint Tutor attempts and request hints when you need them. This page will turn that activity into a simple study report."}
              </p>
            </div>
          </div>
        </Section>
      </main>
    );
  }

  const report = await generateLearningReport(reportInput);

  if (runId && reportInput.reportScope.type === "practice-run") {
    await prisma.learningReportSnapshot.upsert({
      where: {
        practiceRunId: runId
      },
      create: {
        practiceRunId: runId,
        organizationId: reportInput.reportScope.organizationId,
        userId: session.user.id,
        reportJson: report as Prisma.InputJsonValue
      },
      update: {
        organizationId: reportInput.reportScope.organizationId,
        userId: session.user.id,
        reportJson: report as Prisma.InputJsonValue,
        generatedAt: new Date()
      }
    });
  }

  // Derived headline accuracy. Sits as the visual anchor on the hero
  // so a student or parent gets the bottom-line answer immediately.
  const accuracyPct =
    report.totalProblemsAttempted > 0
      ? Math.round((report.totalCorrect / report.totalProblemsAttempted) * 100)
      : 0;

  return (
    <main className="motion-rise">
      {/* ===========================================================
       *  HERO — big accuracy metric + headline
       * ========================================================= */}
      <Section tight className="pt-4 md:pt-6">
        <div className="hero-panel">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="flex flex-col gap-4">
              <Eyebrow>AI Learning Report</Eyebrow>
              <h1
                className="display-headline"
                style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
              >
                <span className="florid florid-gradient">{reportHeading}</span>
              </h1>
              <p className="display-lede">{reportDescription}</p>
            </div>

            <div
              className="flex flex-col gap-2 p-6"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)"
              }}
            >
              <span
                className="text-[11px] font-semibold uppercase"
                style={{
                  color: "var(--subtle)",
                  letterSpacing: "0.14em",
                  fontFamily: "var(--font-mono-custom)"
                }}
              >
                Accuracy
              </span>
              <div
                className="flex items-baseline gap-2"
                style={{
                  fontFamily: "var(--font-display-custom)",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "var(--foreground-strong)"
                }}
              >
                <span
                  style={{
                    fontSize: "clamp(3.5rem, 7vw, 5rem)",
                    lineHeight: 1
                  }}
                >
                  {accuracyPct}
                </span>
                <span
                  style={{
                    fontSize: "2rem",
                    color: "var(--muted)",
                    fontWeight: 600
                  }}
                >
                  %
                </span>
              </div>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {report.totalCorrect} of {report.totalProblemsAttempted} submitted
                correct
                {report.totalUnfinished > 0 ? (
                  <>
                    {" · "}
                    <span style={{ color: "var(--accent-strong, #2b6fff)" }}>
                      {report.totalUnfinished} unfinished
                    </span>
                  </>
                ) : (
                  "."
                )}
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ===========================================================
       *  OUTCOME BREAKDOWN — four Brilliant-style colored tiles
       * ========================================================= */}
      <Section tight className="surface-section-cool">
        <SectionHeader
          eyebrow="Outcome breakdown"
          title="Independence vs. accuracy"
          lede="This separates direct solving from hinted solving — so the report reflects independence as well as accuracy."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="tile tile-teal">
            <p
              className="text-[11px] font-semibold uppercase"
              style={{
                letterSpacing: "0.12em",
                fontFamily: "var(--font-mono-custom)",
                color: "rgba(15, 17, 21, 0.7)"
              }}
            >
              No hint · correct
            </p>
            <p
              className="mt-3"
              style={{
                fontFamily: "var(--font-display-custom)",
                fontSize: "2.25rem",
                fontWeight: 700,
                color: "var(--foreground-strong)",
                lineHeight: 1
              }}
            >
              {report.answerOutcomeBreakdown.withoutHintCorrect}
            </p>
          </div>
          <div className="tile tile-coral">
            <p
              className="text-[11px] font-semibold uppercase"
              style={{
                letterSpacing: "0.12em",
                fontFamily: "var(--font-mono-custom)",
                color: "rgba(15, 17, 21, 0.7)"
              }}
            >
              No hint · incorrect
            </p>
            <p
              className="mt-3"
              style={{
                fontFamily: "var(--font-display-custom)",
                fontSize: "2.25rem",
                fontWeight: 700,
                color: "var(--foreground-strong)",
                lineHeight: 1
              }}
            >
              {report.answerOutcomeBreakdown.withoutHintIncorrect}
            </p>
          </div>
          <div className="tile tile-amber">
            <p
              className="text-[11px] font-semibold uppercase"
              style={{
                letterSpacing: "0.12em",
                fontFamily: "var(--font-mono-custom)",
                color: "rgba(15, 17, 21, 0.7)"
              }}
            >
              Used hint · correct
            </p>
            <p
              className="mt-3"
              style={{
                fontFamily: "var(--font-display-custom)",
                fontSize: "2.25rem",
                fontWeight: 700,
                color: "var(--foreground-strong)",
                lineHeight: 1
              }}
            >
              {report.answerOutcomeBreakdown.withHintCorrect}
            </p>
          </div>
          <div className="tile tile-lavender">
            <p
              className="text-[11px] font-semibold uppercase"
              style={{
                letterSpacing: "0.12em",
                fontFamily: "var(--font-mono-custom)",
                color: "rgba(15, 17, 21, 0.7)"
              }}
            >
              Used hint · incorrect
            </p>
            <p
              className="mt-3"
              style={{
                fontFamily: "var(--font-display-custom)",
                fontSize: "2.25rem",
                fontWeight: 700,
                color: "var(--foreground-strong)",
                lineHeight: 1
              }}
            >
              {report.answerOutcomeBreakdown.withHintIncorrect}
            </p>
          </div>
        </div>
      </Section>

      {/* ===========================================================
       *  SUMMARY + LEARNING PATTERN — narrative blocks
       * ========================================================= */}
      <Section tight>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3">Summary</h2>
            <p
              className="text-sm leading-7"
              style={{ color: "var(--foreground)" }}
            >
              {report.summary}
            </p>
          </Card>
          <Card>
            <h2 className="mb-3">Learning pattern</h2>
            <p
              className="text-sm leading-7"
              style={{ color: "var(--foreground)" }}
            >
              {report.learningPattern}
            </p>
          </Card>
        </div>
      </Section>

      {/* ===========================================================
       *  PRIMARY REINFORCEMENT FOCUS
       * ========================================================= */}
      {report.primaryReinforcementTopic ? (
        <Section tight>
          <Card>
            <Eyebrow>Primary reinforcement focus</Eyebrow>
            <h2
              className="mt-2 mb-3"
              style={{ fontSize: "clamp(1.5rem, 2.4vw, 1.875rem)" }}
            >
              {formatTopicLabel(report.primaryReinforcementTopic)}
            </h2>
            <p
              className="text-sm"
              style={{ color: "var(--muted)", maxWidth: "60ch" }}
            >
              This is the clearest weak area in your recent work. Stay with
              easier follow-up problems here until you can solve them with less
              hint support.
            </p>
          </Card>
        </Section>
      ) : null}

      {/* ===========================================================
       *  TOPICS NEEDING REINFORCEMENT + HIGH-HINT PROBLEMS
       * ========================================================= */}
      <Section tight>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3">Topics needing reinforcement</h2>
            {report.topicsNeedingReinforcement.length > 0 ? (
              <ul className="flex flex-col gap-2 text-sm">
                {report.topicsNeedingReinforcement.map((topicKey, idx) => (
                  <li
                    key={topicKey}
                    style={{
                      padding: "12px 16px",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      color: "var(--foreground)",
                      animation: `rise-in 320ms cubic-bezier(0.2, 0.7, 0.2, 1) ${idx * 60}ms both`
                    }}
                  >
                    {formatTopicLabel(topicKey)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No clear weak topic has emerged yet from your recent attempts.
              </p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3">Problems with high hint usage</h2>
            {report.highHintProblems.length > 0 ? (
              <ul className="flex flex-col gap-2 text-sm">
                {report.highHintProblems.map((problem, idx) => (
                  <li
                    key={problem.problemId}
                    style={{
                      padding: "12px 16px",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      color: "var(--foreground)",
                      animation: `rise-in 320ms cubic-bezier(0.2, 0.7, 0.2, 1) ${idx * 60}ms both`
                    }}
                  >
                    <p
                      className="font-medium"
                      style={{ color: "var(--foreground-strong)" }}
                    >
                      {problem.statementSnippet}
                    </p>
                    <p
                      className="mt-1 text-[11px] font-semibold uppercase"
                      style={{
                        color: "var(--subtle)",
                        letterSpacing: "0.1em",
                        fontFamily: "var(--font-mono-custom)"
                      }}
                    >
                      Hint requests: {problem.hintUsageCount} · Highest level:{" "}
                      {problem.highestHintLevel}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No recent problems required heavy hint support.
              </p>
            )}
          </Card>
        </div>
      </Section>

      {/* ===========================================================
       *  NEXT PRACTICE SUGGESTIONS
       * ========================================================= */}
      <Section tight className="surface-section-warm">
        <SectionHeader
          eyebrow="What to do next"
          title="Next practice suggestions"
        />
        <ul className="mt-8 flex flex-col gap-3">
          {report.nextPracticeSuggestions.map((suggestion, index) => (
            <li
              key={`${index}-${suggestion}`}
              style={{
                padding: 16,
                background: "var(--surface-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--foreground)",
                animation: `rise-in 320ms cubic-bezier(0.2, 0.7, 0.2, 1) ${index * 80}ms both`
              }}
              className="flex items-start gap-3"
            >
              <span
                style={{
                  fontFamily: "var(--font-mono-custom)",
                  background: "var(--accent-soft)",
                  color: "var(--accent-strong)",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: 2
                }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-sm leading-6">{suggestion}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* ===========================================================
       *  QUESTION REVIEW — per-problem cards
       * ========================================================= */}
      <Section tight>
        <SectionHeader
          eyebrow="Question review"
          title="What to revisit"
          lede="Up to 8 problems — unfinished ones first so you know where to come back, then the hardest incorrect submissions. Correct problems are not listed; nothing to review there."
        />
        <div className="mt-8 flex flex-col gap-3">
          {report.questionResults.length === 0 ? (
            <Card>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Nothing to revisit — you got everything you submitted correct.
              </p>
            </Card>
          ) : null}
          {report.questionResults.map((result, idx) => (
            <Card key={result.problemId} className="stagger-parent">
              <div
                style={{
                  animation: `rise-in 320ms cubic-bezier(0.2, 0.7, 0.2, 1) ${idx * 60}ms both`
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2" style={{ minWidth: 0, flex: 1 }}>
                    <h3
                      className="text-base font-semibold"
                      style={{ color: "var(--foreground-strong)" }}
                    >
                      Problem {result.problemNumber}
                    </h3>
                    {/* Render the full statement via KaTeX rather than
                        dumping raw "$x^2 + 1$" text on the page. */}
                    <ProblemStatement
                      statement={result.statement}
                      statementFormat={result.statementFormat}
                      compact
                      className="text-sm leading-6"
                    />
                  </div>
                  <Tag
                    status={
                      result.outcomeKind === "unfinished" ? "uncertain" : "invalid"
                    }
                  >
                    {result.outcomeKind === "unfinished"
                      ? "⊘ Unfinished"
                      : "✗ Incorrect"}
                  </Tag>
                </div>

                <p
                  className="mt-3 text-[11px] font-semibold uppercase"
                  style={{
                    color: "var(--subtle)",
                    letterSpacing: "0.12em",
                    fontFamily: "var(--font-mono-custom)"
                  }}
                >
                  {result.usedHint ? "Used hint before answering" : "Answered without hint"}
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div
                    style={{
                      padding: 14,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)"
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
                      className="mt-2 text-sm"
                      style={{ color: "var(--foreground)" }}
                    >
                      {formatAnswerDisplay(result.submittedAnswer)}
                    </p>
                  </div>
                  <div
                    style={{
                      padding: 14,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)"
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
                      Correct answer
                    </p>
                    <p
                      className="mt-2 text-sm"
                      style={{ color: "var(--foreground)" }}
                    >
                      {formatAnswerDisplay(result.correctAnswer)}
                    </p>
                  </div>
                </div>

                {result.outcomeKind === "incorrect" && result.solutionSketch ? (
                  <div
                    className="mt-4"
                    style={{
                      padding: 16,
                      background: "var(--warning-soft)",
                      border:
                        "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
                      borderRadius: "var(--radius-md)"
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
                      Solution sketch
                    </p>
                    <p
                      className="mt-2 text-sm leading-7"
                      style={{ color: "var(--foreground)" }}
                    >
                      {result.solutionSketch}
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </main>
  );
}
