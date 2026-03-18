import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { HintTutorPanel } from "@/components/hint-tutor-panel";
import { ProblemStatement, normalizeChoiceForDisplay } from "@/components/problem-statement";
import { authOptions } from "@/lib/auth";
import { isTutorUsableProblemSet } from "@/lib/tutor-usable-sets";

type ProblemTutorPageProps = {
  params: Promise<{
    problemId: string;
  }>;
  searchParams: Promise<{
    runId?: string;
  }>;
};

function formatAnswerFormat(value: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION"): string {
  if (value === "MULTIPLE_CHOICE") {
    return "Multiple choice";
  }
  if (value === "INTEGER") {
    return "Integer";
  }
  return "Expression";
}

function normalizeChoiceList(choices: unknown): string[] {
  if (!Array.isArray(choices)) {
    return [];
  }

  return choices
    .map((choice) => {
      if (typeof choice === "string") {
        return choice.trim();
      }

      if (choice === null || choice === undefined) {
        return "";
      }

      return String(choice).trim();
    })
    .filter((choice) => choice.length > 0);
}

function buildChoiceOptions(choices: string[]) {
  return choices.map((choice, index) => ({
    label: String.fromCharCode(65 + index),
    text: choice,
    displayText: normalizeChoiceForDisplay(choice)
  }));
}

export default async function ProblemTutorPage({ params, searchParams }: ProblemTutorPageProps) {
  const { problemId } = await params;
  const { runId } = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/problems/${problemId}${runId ? `?runId=${runId}` : ""}`)}`);
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      number: true,
      statement: true,
      diagramImageUrl: true,
      diagramImageAlt: true,
      choicesImageUrl: true,
      choicesImageAlt: true,
      statementFormat: true,
      choices: true,
      answerFormat: true,
      problemSet: {
        select: {
          id: true,
          title: true,
          contest: true,
          year: true,
          exam: true,
          sourceUrl: true,
          problems: {
            orderBy: {
              number: "asc"
            },
            select: {
              id: true,
              number: true
            }
          }
        }
      }
    }
  });

  if (!problem) {
    notFound();
  }

  const choiceList = normalizeChoiceList(problem.choices);
  const choiceOptions = buildChoiceOptions(choiceList);
  const isTutorUsableSet = isTutorUsableProblemSet(problem.problemSet);
  const practiceRun = runId
    ? await prisma.practiceRun.findFirst({
        where: {
          id: runId,
          userId: session.user.id,
          problemSetId: problem.problemSet.id
        },
        select: {
          id: true
        }
      })
    : null;

  if (runId && !practiceRun) {
    notFound();
  }

  const orderedProblems = problem.problemSet.problems;
  const currentProblemIndex = orderedProblems.findIndex((item) => item.id === problem.id);
  const nextProblem =
    currentProblemIndex >= 0 && currentProblemIndex < orderedProblems.length - 1
      ? orderedProblems[currentProblemIndex + 1]
      : null;
  const progressLabel =
    currentProblemIndex >= 0 ? `Problem ${currentProblemIndex + 1} of ${orderedProblems.length}` : null;
  const practiceRunId = practiceRun?.id ?? null;

  function buildProblemHref(nextProblemId: string): string {
    const basePath = `/problems/${encodeURIComponent(nextProblemId)}`;
    return practiceRunId ? `${basePath}?runId=${encodeURIComponent(practiceRunId)}` : basePath;
  }

  function buildReportHref(): string {
    const basePath = "/reports";
    return practiceRunId ? `${basePath}?runId=${encodeURIComponent(practiceRunId)}` : basePath;
  }

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <span className="badge">AI Hint Tutor</span>
            <h1 className="text-2xl font-semibold text-slate-900">Problem {problem.number}</h1>
            <p className="text-sm text-slate-600">
              {problem.problemSet.title} · {problem.problemSet.contest} {problem.problemSet.year}
              {problem.problemSet.exam ? ` ${problem.problemSet.exam}` : ""}
            </p>
            {isTutorUsableSet && progressLabel ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{progressLabel}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {isTutorUsableSet ? (
              <Link className="btn-secondary" href={`/problems/set/${encodeURIComponent(problem.problemSet.id)}`}>
                Back to Set
              </Link>
            ) : null}
            <Link className="btn-secondary" href="/problems">
              Back to Problems
            </Link>
          </div>
        </div>
      </section>

      <section className="surface-card space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge">Problem Prompt</span>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Answer format: {formatAnswerFormat(problem.answerFormat)}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Statement format: {problem.statementFormat}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <ProblemStatement statement={problem.statement} statementFormat={problem.statementFormat} />
        </div>

        {problem.diagramImageUrl ? (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <img
              src={problem.diagramImageUrl}
              alt={problem.diagramImageAlt ?? `Problem ${problem.number} diagram`}
              className="mx-auto max-h-[28rem] w-auto max-w-full rounded-lg"
              loading="lazy"
            />
          </div>
        ) : null}

        {choiceList.length > 0 ? (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-700">
            {problem.choicesImageUrl ? (
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                <img
                  src={problem.choicesImageUrl}
                  alt={problem.choicesImageAlt ?? `Problem ${problem.number} answer choices`}
                  className="mx-auto max-h-[28rem] w-auto max-w-full rounded-lg"
                  loading="lazy"
                />
              </div>
            ) : null}

            <ol className="space-y-2">
              {choiceOptions.map((choice) => (
                <li key={`${choice.label}-${choice.text}`} className="flex gap-3">
                  <span className="font-semibold text-slate-500">{choice.label}.</span>
                  <div className="min-w-0 flex-1">
                    <ProblemStatement
                      statement={choice.displayText}
                      statementFormat="MARKDOWN_LATEX"
                      compact
                      className="text-sm leading-6 text-slate-700"
                    />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <HintTutorPanel
        problemId={problem.id}
        practiceRunId={practiceRunId}
        answerFormat={problem.answerFormat}
        choiceOptions={choiceOptions}
      />

      {isTutorUsableSet ? (
        <section className="surface-card space-y-3">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">Practice Progression</h2>
            <p className="text-sm text-slate-600">
              Move through this tutor-ready set in order, then review your latest learning report.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" href={`/problems/set/${encodeURIComponent(problem.problemSet.id)}`}>
              Back to Set
            </Link>

            {nextProblem ? (
              <Link className="btn-primary" href={buildProblemHref(nextProblem.id)}>
                Next Problem
              </Link>
            ) : (
              <Link className="btn-primary" href={buildReportHref()}>
                View Report
              </Link>
            )}
          </div>

          {nextProblem ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Next up: Problem {nextProblem.number}
            </p>
          ) : (
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              You reached the end of this set. Review your latest report to continue practicing.
            </p>
          )}
        </section>
      ) : null}
    </main>
  );
}
