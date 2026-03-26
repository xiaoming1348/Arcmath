import { getServerSession } from "next-auth";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { generateLearningReport } from "@/lib/ai/learning-report";
import { appRouter } from "@/lib/trpc/router";
import { createTRPCContext } from "@/lib/trpc/server";

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
  const reportHeading = isRunScoped ? "Set Report" : "Your latest report";
  const reportDescription = isRunScoped
    ? `Based on your completed run for ${reportInput.reportScope.problemSetTitle ?? "this practice set"}${reportInput.reportScope.problemSetLabel ? ` · ${reportInput.reportScope.problemSetLabel}` : ""}.`
    : "Based on your most recent Hint Tutor attempts and hint usage.";

  if (reportInput.attempts.length === 0) {
    return (
      <main className="motion-rise space-y-4">
        <section className="surface-card space-y-3">
          <span className="badge">AI Learning Report</span>
          <h1 className="text-2xl font-semibold text-slate-900">{reportHeading}</h1>
          <p className="text-sm text-slate-600">
            {isRunScoped
              ? "This practice run does not have any recorded attempts yet."
              : "Complete a few Hint Tutor attempts and request hints when you need them. This page will turn that activity into a simple study report."}
          </p>
        </section>
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

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <div className="space-y-2">
          <span className="badge">AI Learning Report</span>
          <h1 className="text-2xl font-semibold text-slate-900">{reportHeading}</h1>
          <p className="text-sm text-slate-600">{reportDescription}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Problems attempted</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{report.totalProblemsAttempted}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Correct</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{report.totalCorrect}</p>
          </div>
        </div>
      </section>

      <section className="surface-card space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">Answer outcome breakdown</h2>
          <p className="text-sm text-slate-600">
            This separates direct solving from hinted solving, so the report reflects independence as well as accuracy.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">No hint · correct</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">{report.answerOutcomeBreakdown.withoutHintCorrect}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">No hint · incorrect</p>
            <p className="mt-2 text-2xl font-semibold text-rose-700">{report.answerOutcomeBreakdown.withoutHintIncorrect}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Used hint · correct</p>
            <p className="mt-2 text-2xl font-semibold text-amber-700">{report.answerOutcomeBreakdown.withHintCorrect}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Used hint · incorrect</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{report.answerOutcomeBreakdown.withHintIncorrect}</p>
          </div>
        </div>
      </section>

      <section className="surface-card space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
        <p className="text-sm leading-7 text-slate-700">{report.summary}</p>
      </section>

      {report.primaryReinforcementTopic ? (
        <section className="surface-card space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Primary reinforcement focus
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              {formatTopicLabel(report.primaryReinforcementTopic)}
            </h2>
          </div>
          <p className="text-sm text-slate-700">
            This is the clearest weak area in your recent work. Stay with easier follow-up problems here until you can solve them with less hint support.
          </p>
        </section>
      ) : null}

      <section className="surface-card space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Learning pattern</h2>
        <p className="text-sm leading-7 text-slate-700">{report.learningPattern}</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Topics needing reinforcement</h2>
          {report.topicsNeedingReinforcement.length > 0 ? (
            <ul className="space-y-2 text-sm text-slate-700">
              {report.topicsNeedingReinforcement.map((topicKey) => (
                <li key={topicKey} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  {formatTopicLabel(topicKey)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No clear weak topic has emerged yet from your recent attempts.</p>
          )}
        </div>

        <div className="surface-card space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Problems with high hint usage</h2>
          {report.highHintProblems.length > 0 ? (
            <ul className="space-y-2 text-sm text-slate-700">
              {report.highHintProblems.map((problem) => (
                <li key={problem.problemId} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-medium text-slate-900">{problem.statementSnippet}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Hint requests: {problem.hintUsageCount} · Highest level: {problem.highestHintLevel}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No recent problems required heavy hint support.</p>
          )}
        </div>
      </section>

      <section className="surface-card space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Next practice suggestions</h2>
        <ul className="space-y-2 text-sm text-slate-700">
          {report.nextPracticeSuggestions.map((suggestion, index) => (
            <li key={`${index}-${suggestion}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              {suggestion}
            </li>
          ))}
        </ul>
      </section>

      <section className="surface-card space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">Question review</h2>
          <p className="text-sm text-slate-600">
            Compare your submitted answers with the correct answers. Incorrect problems include a short solution sketch.
          </p>
        </div>

        <div className="space-y-3">
          {report.questionResults.map((result) => (
            <article key={result.problemId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-900">Problem {result.problemNumber}</h3>
                  <p className="text-sm text-slate-700">{result.statementSnippet}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    result.isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {result.isCorrect ? "Correct" : "Incorrect"}
                </span>
              </div>

              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {result.usedHint ? "Used hint before answering" : "Answered without hint"}
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your answer</p>
                  <p className="mt-2 text-sm text-slate-900">{formatAnswerDisplay(result.submittedAnswer)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Correct answer</p>
                  <p className="mt-2 text-sm text-slate-900">{formatAnswerDisplay(result.correctAnswer)}</p>
                </div>
              </div>

              {!result.isCorrect && result.solutionSketch ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Solution sketch</p>
                  <p className="mt-2 text-sm leading-7 text-slate-800">{result.solutionSketch}</p>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
