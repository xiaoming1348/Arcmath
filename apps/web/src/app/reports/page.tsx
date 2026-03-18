import Link from "next/link";
import { getServerSession } from "next-auth";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
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

      <section className="surface-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">Continue Practice</h2>
            <p className="text-sm text-slate-600">
              Start your next round of practice directly from these recommended problems.
            </p>
          </div>
        </div>

        {reportInput.recommendedProblems.length > 0 ? (
          <div className="space-y-3">
            {reportInput.recommendedProblems.map((problem) => (
              <article
                key={problem.problemId}
                className="flex flex-wrap items-start justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
              >
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-slate-900">Problem {problem.number}</h3>
                  <p className="text-sm text-slate-700">{problem.statementSnippet}</p>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {problem.topicKey ? <span className="badge">{formatTopicLabel(problem.topicKey)}</span> : null}
                    {problem.difficultyBand ? <span className="badge">{problem.difficultyBand}</span> : null}
                  </div>
                </div>

                <Link className="btn-primary" href={`/problems/${encodeURIComponent(problem.problemId)}`}>
                  Continue
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            No follow-up practice problem is ready yet. Solve a few more Hint Tutor problems to unlock recommendations.
          </p>
        )}
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
    </main>
  );
}
