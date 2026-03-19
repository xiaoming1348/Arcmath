import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { ProblemStatement } from "@/components/problem-statement";
import { gradeAnswer } from "@/lib/answer-grading";
import { authOptions } from "@/lib/auth";
import { userCanAccessRealTutorProblemSet } from "@/lib/tutor-premium-access";
import { getTutorUsableSetKind } from "@/lib/tutor-usable-sets";

type PracticeSetPageProps = {
  params: Promise<{
    problemSetId: string;
  }>;
};

function makeStatementSnippet(statement: string | null): string {
  const normalized = (statement ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 137)}...`;
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

export default async function PracticeSetPage({ params }: PracticeSetPageProps) {
  const { problemSetId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/problems/set/${problemSetId}`)}`);
  }

  const practiceSet = await prisma.problemSet.findUnique({
    where: {
      id: problemSetId
    },
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
          number: true,
          statement: true,
          statementFormat: true,
          answer: true,
          answerFormat: true,
          choices: true,
          diagramImageUrl: true,
          diagramImageAlt: true,
          topicKey: true,
          difficultyBand: true
        }
      }
    }
  });

  if (!practiceSet) {
    notFound();
  }

  const setKind = getTutorUsableSetKind(practiceSet);
  if (!setKind) {
    notFound();
  }

  const practiceSetData = practiceSet;

  if (
    setKind === "real" &&
    !(await userCanAccessRealTutorProblemSet({
      prisma,
      user: session.user,
      problemSetId: practiceSetData.id
    }))
  ) {
    redirect(`/membership?callbackUrl=${encodeURIComponent(`/problems/set/${practiceSetData.id}`)}`);
  }

  const totalProblems = practiceSetData.problems.length;
  const practiceRun =
    totalProblems > 0
      ? ((await prisma.practiceRun.findFirst({
          where: {
            userId: session.user.id,
            problemSetId: practiceSetData.id,
            completedAt: null
          },
          orderBy: {
            startedAt: "desc"
          },
          select: {
            id: true
          }
        })) ??
        (await prisma.practiceRun.create({
          data: {
            userId: session.user.id,
            problemSetId: practiceSetData.id
          },
          select: {
            id: true
          }
        })))
      : null;

  async function submitDiagnosticRun(formData: FormData) {
    "use server";

    if (setKind !== "seeded") {
      notFound();
    }

    const currentSession = await getServerSession(authOptions);
    if (!currentSession?.user || !practiceRun) {
      redirect(`/login?callbackUrl=${encodeURIComponent(`/problems/set/${problemSetId}`)}`);
    }

    const validatedRun = await prisma.practiceRun.findFirst({
      where: {
        id: practiceRun.id,
        userId: currentSession.user.id,
        problemSetId: practiceSetData.id
      },
      select: {
        id: true
      }
    });

    if (!validatedRun) {
      notFound();
    }

    const attemptRows = practiceSetData.problems.map((problem) => {
      const submittedAnswer = String(formData.get(`answer:${problem.id}`) ?? "").trim();
      const gradingResult = gradeAnswer({
        answerFormat: problem.answerFormat,
        submittedAnswer,
        canonicalAnswer: problem.answer,
        choices: problem.choices
      });

      return {
        userId: currentSession.user.id,
        problemId: problem.id,
        practiceRunId: validatedRun.id,
        submittedAnswer,
        normalizedAnswer: gradingResult.normalizedSubmittedAnswer,
        isCorrect: gradingResult.isCorrect,
        explanationText: null
      };
    });

    await prisma.$transaction([
      prisma.problemHintUsage.deleteMany({
        where: {
          userId: currentSession.user.id,
          practiceRunId: validatedRun.id
        }
      }),
      prisma.problemAttempt.deleteMany({
        where: {
          userId: currentSession.user.id,
          practiceRunId: validatedRun.id
        }
      }),
      prisma.problemAttempt.createMany({
        data: attemptRows
      }),
      prisma.practiceRun.update({
        where: {
          id: validatedRun.id
        },
        data: {
          completedAt: new Date()
        }
      })
    ]);

    redirect(`/reports?runId=${encodeURIComponent(validatedRun.id)}`);
  }

  if (setKind === "real") {
    return (
      <main className="motion-rise space-y-4">
        <section className="surface-card space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <span className="badge">Premium Real Set</span>
              <h1 className="text-2xl font-semibold text-slate-900">{practiceSetData.title}</h1>
              <p className="text-sm text-slate-600">
                {practiceSetData.contest} {practiceSetData.year}
                {practiceSetData.exam ? ` ${practiceSetData.exam}` : ""} · {totalProblems} problems
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="btn-secondary" href="/problems">
                Back to Catalog
              </Link>
              {practiceRun && practiceSetData.problems[0] ? (
                <Link
                  className="btn-primary"
                  href={`/problems/${encodeURIComponent(practiceSetData.problems[0].id)}?runId=${encodeURIComponent(practiceRun.id)}`}
                >
                  Start Practice
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="surface-card space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">Problem list</h2>
            <p className="text-sm text-slate-600">
              Open any problem below to use the hint tutor, submit your answer, and move through the set with run-scoped reporting.
            </p>
          </div>

          <div className="space-y-3">
            {practiceSetData.problems.map((problem) => (
              <article key={problem.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900">Problem {problem.number}</h3>
                    <p className="text-sm text-slate-600">{makeStatementSnippet(problem.statement)}</p>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {problem.difficultyBand ? <span>{problem.difficultyBand}</span> : null}
                      {formatTopicLabel(problem.topicKey) ? <span>{formatTopicLabel(problem.topicKey)}</span> : null}
                    </div>
                  </div>

                  {practiceRun ? (
                    <Link
                      className="btn-primary"
                      href={`/problems/${encodeURIComponent(problem.id)}?runId=${encodeURIComponent(practiceRun.id)}`}
                    >
                      Open Tutor
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <span className="badge">Diagnostic Test</span>
            <h1 className="text-2xl font-semibold text-slate-900">{practiceSetData.title}</h1>
            <p className="text-sm text-slate-600">{totalProblems} integer-answer problems. Work in any order and submit once at the end.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" href="/problems">
              Back to Tests
            </Link>
          </div>
        </div>
      </section>

      {practiceRun && totalProblems > 0 ? (
        <form action={submitDiagnosticRun} className="surface-card space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="badge">Full Test Mode</span>
                <h2 className="text-lg font-semibold text-slate-900">{practiceSetData.title}</h2>
              </div>
              <p className="text-sm text-slate-600">All questions are integer response in this diagnostic mode.</p>
            </div>
            <p className="text-sm text-slate-600">Enter an integer for each problem. Leave blank if you want the problem counted as unanswered.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {practiceSetData.problems.map((problem) => (
              <a
                key={problem.id}
                href={`#problem-${problem.number}`}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
              >
                {problem.number}
              </a>
            ))}
          </div>

          <div className="space-y-6">
            {practiceSetData.problems.map((problem) => (
              <article
                key={problem.id}
                id={`problem-${problem.number}`}
                className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-5"
              >
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-slate-900">Problem {problem.number}</h3>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <ProblemStatement statement={problem.statement} statementFormat={problem.statementFormat} />
                  </div>
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

                <label className="block text-sm text-slate-700">
                  Your Answer
                  <input
                    name={`answer:${problem.id}`}
                    className="input-field"
                    type="text"
                    placeholder="Type an integer"
                    autoComplete="off"
                  />
                </label>
              </article>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-600">
              Submit when you are done. Blank answers will be treated as unanswered and graded accordingly.
            </p>
            <button type="submit" className="btn-primary">
              Submit Test
            </button>
          </div>
        </form>
      ) : (
        <section className="surface-card">
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            This set does not contain any problems yet.
          </div>
        </section>
      )}
    </main>
  );
}
