import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canManageOrganization, getActiveOrganizationMembership } from "@/lib/organizations";

type ReportSnapshotPageProps = {
  params: Promise<{
    snapshotId: string;
  }>;
};

function formatTopicLabel(topicKey: string): string {
  return topicKey
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function formatAnswerDisplay(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "No answer";
}

function isLearningReport(value: unknown): value is {
  totalProblemsAttempted: number;
  totalCorrect: number;
  primaryReinforcementTopic: string | null;
  topicsNeedingReinforcement: string[];
  highHintProblems: Array<{
    problemId: string;
    statementSnippet: string;
    hintUsageCount: number;
    highestHintLevel: number;
  }>;
  summary: string;
  learningPattern: string;
  nextPracticeSuggestions: string[];
  questionResults: Array<{
    problemId: string;
    problemNumber: number;
    statementSnippet: string;
    submittedAnswer: string;
    correctAnswer: string | null;
    isCorrect: boolean;
    solutionSketch: string | null;
  }>;
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      "summary" in value &&
      "questionResults" in value &&
      Array.isArray((value as { questionResults?: unknown }).questionResults)
  );
}

export default async function ReportSnapshotPage({ params }: ReportSnapshotPageProps) {
  const { snapshotId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/org/reports/${snapshotId}`)}`);
  }

  const membership = await getActiveOrganizationMembership(prisma, session.user.id);
  if (!membership || !canManageOrganization(membership.role)) {
    redirect("/org");
  }

  const snapshot = await prisma.learningReportSnapshot.findFirst({
    where: {
      id: snapshotId,
      organizationId: membership.organizationId
    },
    select: {
      generatedAt: true,
      reportJson: true,
      user: {
        select: {
          email: true,
          name: true
        }
      },
      practiceRun: {
        select: {
          problemSet: {
            select: {
              title: true
            }
          }
        }
      }
    }
  });

  if (!snapshot || !isLearningReport(snapshot.reportJson)) {
    notFound();
  }

  const report = snapshot.reportJson;

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <span className="badge">Organization Report Snapshot</span>
        <h1 className="text-2xl font-semibold text-slate-900">{snapshot.practiceRun.problemSet.title}</h1>
        <p className="text-sm text-slate-600">
          {snapshot.user.name ?? snapshot.user.email} · generated {snapshot.generatedAt.toLocaleString("en-US")}
        </p>
      </section>

      <section className="surface-card space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
        <p className="text-sm leading-7 text-slate-700">{report.summary}</p>
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

      {report.primaryReinforcementTopic ? (
        <section className="surface-card space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Primary reinforcement focus</p>
          <p className="text-lg font-semibold text-slate-900">{formatTopicLabel(report.primaryReinforcementTopic)}</p>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
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
            <p className="text-sm text-slate-600">No strong weak topic detected in this snapshot.</p>
          )}
        </div>

        <div className="surface-card space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Next practice suggestions</h2>
          <ul className="space-y-2 text-sm text-slate-700">
            {report.nextPracticeSuggestions.map((suggestion) => (
              <li key={suggestion} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="surface-card space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Question review</h2>
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

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted answer</p>
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
