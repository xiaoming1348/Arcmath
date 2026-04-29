import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { ProblemStatement } from "@/components/problem-statement";
import { gradeAnswer } from "@/lib/answer-grading";
import { authOptions } from "@/lib/auth";
import { getActiveOrganizationMembership } from "@/lib/organizations";
import {
  getDiagnosticStageLabel,
  getProblemSetModeLabel,
  isDiagnosticSet,
  isPerProblemMode,
  isRealExamSet,
  isWholeSetSubmitMode
} from "@/lib/problem-set-modes";
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

export default async function PracticeSetPage({ params }: PracticeSetPageProps) {
  const { problemSetId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/problems/set/${problemSetId}`)}`);
  }

  const organizationMembership = await getActiveOrganizationMembership(prisma, session.user.id);

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
      category: true,
      diagnosticStage: true,
      submissionMode: true,
      tutorEnabled: true,
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
          choicesImageUrl: true,
          choicesImageAlt: true,
          sourceLabel: true,
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
    isRealExamSet(practiceSetData) &&
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
            organizationId: organizationMembership?.organizationId ?? null,
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
            problemSetId: practiceSetData.id,
            organizationId: organizationMembership?.organizationId ?? null
          },
          select: {
            id: true
          }
        })))
      : null;

  async function submitDiagnosticRun(formData: FormData) {
    "use server";

    if (!isWholeSetSubmitMode(practiceSetData)) {
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

    const attemptRows = practiceSetData.problems.flatMap((problem) => {
      if (problem.answerFormat === "PROOF") {
        // Proof problems use the per-problem ProofAttempt flow; skip whole-set grading.
        return [];
      }
      if (problem.answerFormat === "WORKED_SOLUTION") {
        // WORKED_SOLUTION problems (STEP full questions, MAT long
        // questions, Euclid Part B/C) have no auto-grade path. They
        // belong to per-problem mode sets today — whole-set submit
        // simply skips them. A self-report "I solved it" toggle could
        // be recorded here in a future PR.
        return [];
      }
      const answerFormat = problem.answerFormat;
      const submittedAnswer = String(formData.get(`answer:${problem.id}`) ?? "").trim();
      const gradingResult = gradeAnswer({
        answerFormat,
        submittedAnswer,
        canonicalAnswer: problem.answer,
        choices: problem.choices
      });

      return [{
        userId: currentSession.user.id,
        problemId: problem.id,
        practiceRunId: validatedRun.id,
        submittedAnswer,
        normalizedAnswer: gradingResult.normalizedSubmittedAnswer,
        isCorrect: gradingResult.isCorrect,
        explanationText: null
      }];
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

  if (isPerProblemMode(practiceSetData)) {
    return (
      <main className="motion-rise space-y-4">
        <section className="surface-card space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <span className="badge">{getProblemSetModeLabel(practiceSetData)}</span>
                {practiceSetData.diagnosticStage ? (
                  <span className="badge">{getDiagnosticStageLabel(practiceSetData.diagnosticStage)}</span>
                ) : null}
              </div>
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
                      {practiceSetData.tutorEnabled ? "Open Tutor" : "Open Problem"}
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
            <div className="flex flex-wrap gap-2">
              <span className="badge">{getProblemSetModeLabel(practiceSetData)}</span>
              {practiceSetData.diagnosticStage ? (
                <span className="badge">{getDiagnosticStageLabel(practiceSetData.diagnosticStage)}</span>
              ) : null}
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">{practiceSetData.title}</h1>
            <p className="text-sm text-slate-600">
              {isDiagnosticSet(practiceSetData)
                ? `${totalProblems} problems. Work in any order and submit once at the end.`
                : `${practiceSetData.contest} ${practiceSetData.year}${practiceSetData.exam ? ` ${practiceSetData.exam}` : ""} · ${totalProblems} problems. Submit once at the end to score the full set.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" href="/problems">
              Back to Catalog
            </Link>
          </div>
        </div>
      </section>

      {practiceRun && totalProblems > 0 ? (
        <form action={submitDiagnosticRun} className="surface-card space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="badge">Whole-set submit</span>
                <h2 className="text-lg font-semibold text-slate-900">{practiceSetData.title}</h2>
              </div>
              <p className="text-sm text-slate-600">
                {practiceSetData.tutorEnabled
                  ? "Tutor is enabled for this set."
                  : "Hints are disabled during whole-set mode. Answers are revealed only after submission."}
              </p>
            </div>
            <p className="text-sm text-slate-600">
              Enter an answer for each problem. Leave blank if you want the problem counted as unanswered.
            </p>
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
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-slate-900">Problem {problem.number}</h3>
                    {problem.sourceLabel ? (
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Source · {problem.sourceLabel}
                      </span>
                    ) : null}
                  </div>
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

                {problem.choicesImageUrl ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Choice diagram</p>
                    <img
                      src={problem.choicesImageUrl}
                      alt={problem.choicesImageAlt ?? `Problem ${problem.number} answer choices`}
                      className="mx-auto max-h-[24rem] w-auto max-w-full rounded-lg"
                      loading="lazy"
                    />
                  </div>
                ) : null}

                {problem.answerFormat === "MULTIPLE_CHOICE" ? (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-slate-700">Select your answer</legend>
                    <div className="space-y-2">
                      {normalizeChoiceOptions(problem.choices).map((choice) => (
                        <label
                          key={`${problem.id}-${choice.label}`}
                          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                        >
                          <input type="radio" name={`answer:${problem.id}`} value={choice.label} />
                          <span className="flex-1 space-y-1 text-slate-700">
                            <span className="block font-semibold text-slate-500">{choice.label}.</span>
                            {!problem.choicesImageUrl ? (
                              <ProblemStatement statement={choice.text} statementFormat="MARKDOWN_LATEX" compact />
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <label className="block text-sm text-slate-700">
                    Your Answer
                    <input
                      name={`answer:${problem.id}`}
                      className="input-field"
                      type="text"
                      placeholder={problem.answerFormat === "INTEGER" ? "Type an integer" : "Type your answer"}
                      autoComplete="off"
                    />
                  </label>
                )}
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
