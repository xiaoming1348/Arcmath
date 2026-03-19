import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { HintTutorPanel } from "@/components/hint-tutor-panel";
import { ProblemStatement } from "@/components/problem-statement";
import { authOptions } from "@/lib/auth";
import { userCanAccessRealTutorProblemSet } from "@/lib/tutor-premium-access";
import { getTutorUsableSetKind } from "@/lib/tutor-usable-sets";

type ProblemTutorPageProps = {
  params: Promise<{
    problemId: string;
  }>;
  searchParams: Promise<{
    runId?: string;
  }>;
};

function normalizeChoiceOptions(choices: unknown): Array<{ label: string; text: string }> {
  if (Array.isArray(choices)) {
    return choices
      .map((choice, index) => ({
        label: String.fromCharCode(65 + index),
        text: typeof choice === "string" ? choice : String(choice ?? "")
      }))
      .filter((choice) => choice.text.trim().length > 0);
  }

  if (choices && typeof choices === "object") {
    return Object.entries(choices as Record<string, unknown>)
      .map(([label, value]) => ({
        label: label.trim().toUpperCase(),
        text: typeof value === "string" ? value : String(value ?? "")
      }))
      .filter((choice) => /^[A-E]$/.test(choice.label) && choice.text.trim().length > 0);
  }

  return [];
}

function formatTopicLabel(topicKey: string | null): string | null {
  if (!topicKey) {
    return null;
  }

  return topicKey
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
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
      statementFormat: true,
      choices: true,
      answerFormat: true,
      diagramImageUrl: true,
      diagramImageAlt: true,
      choicesImageUrl: true,
      choicesImageAlt: true,
      topicKey: true,
      difficultyBand: true,
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

  const setKind = getTutorUsableSetKind(problem.problemSet);
  if (!setKind) {
    notFound();
  }

  if (setKind === "seeded") {
    redirect(
      `/problems/set/${encodeURIComponent(problem.problemSet.id)}${runId ? `?runId=${encodeURIComponent(runId)}` : ""}#problem-${problem.number}`
    );
  }

  if (
    !(await userCanAccessRealTutorProblemSet({
      prisma,
      user: session.user,
      problemSetId: problem.problemSet.id
    }))
  ) {
    redirect(`/membership?callbackUrl=${encodeURIComponent(`/problems/${problem.id}${runId ? `?runId=${runId}` : ""}`)}`);
  }

  let practiceRunId: string | null = null;
  if (runId) {
    const practiceRun = await prisma.practiceRun.findFirst({
      where: {
        id: runId,
        userId: session.user.id,
        problemSetId: problem.problemSet.id
      },
      select: {
        id: true
      }
    });

    if (!practiceRun) {
      notFound();
    }

    practiceRunId = practiceRun.id;
  }

  const currentIndex = problem.problemSet.problems.findIndex((entry) => entry.id === problem.id);
  const nextProblem = currentIndex >= 0 ? problem.problemSet.problems[currentIndex + 1] ?? null : null;
  const choiceOptions = normalizeChoiceOptions(problem.choices);

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <span className="badge">Premium Real Set</span>
            <h1 className="text-2xl font-semibold text-slate-900">
              {problem.problemSet.title} · Problem {problem.number}
            </h1>
            <p className="text-sm text-slate-600">
              {problem.problemSet.contest} {problem.problemSet.year}
              {problem.problemSet.exam ? ` ${problem.problemSet.exam}` : ""}
            </p>
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {problem.difficultyBand ? <span>{problem.difficultyBand}</span> : null}
              {formatTopicLabel(problem.topicKey) ? <span>{formatTopicLabel(problem.topicKey)}</span> : null}
              <span>
                Problem {currentIndex + 1} of {problem.problemSet.problems.length}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" href={`/problems/set/${encodeURIComponent(problem.problemSet.id)}`}>
              Back to Set
            </Link>
            {nextProblem ? (
              <Link
                className="btn-primary"
                href={`/problems/${encodeURIComponent(nextProblem.id)}${practiceRunId ? `?runId=${encodeURIComponent(practiceRunId)}` : ""}`}
              >
                Next Problem
              </Link>
            ) : practiceRunId ? (
              <Link className="btn-primary" href={`/reports?runId=${encodeURIComponent(practiceRunId)}`}>
                View Report
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="surface-card space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <ProblemStatement statement={problem.statement} statementFormat={problem.statementFormat} />
        </div>

        {problem.diagramImageUrl ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <img
              src={problem.diagramImageUrl}
              alt={problem.diagramImageAlt ?? `Problem ${problem.number} diagram`}
              className="mx-auto max-h-[28rem] w-auto max-w-full rounded-lg"
              loading="lazy"
            />
          </div>
        ) : null}

        {problem.choicesImageUrl ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <img
              src={problem.choicesImageUrl}
              alt={problem.choicesImageAlt ?? `Problem ${problem.number} answer choices`}
              className="mx-auto max-h-[24rem] w-auto max-w-full rounded-lg"
              loading="lazy"
            />
          </div>
        ) : null}

        {problem.answerFormat === "MULTIPLE_CHOICE" && choiceOptions.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Choices</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {choiceOptions.map((choice) => (
                <div key={`${choice.label}-${choice.text}`} className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="font-semibold text-slate-500">{choice.label}.</span> {choice.text}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <HintTutorPanel
        problemId={problem.id}
        practiceRunId={practiceRunId}
        answerFormat={problem.answerFormat}
        choiceOptions={choiceOptions}
      />
    </main>
  );
}
