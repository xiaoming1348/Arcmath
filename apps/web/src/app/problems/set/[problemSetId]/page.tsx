import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { ProblemStatement } from "@/components/problem-statement";
import { RestartAttemptButton } from "@/components/restart-attempt-button";
import { RouteProgressLink } from "@/components/route-progress-link";
import { gradeAnswer } from "@/lib/answer-grading";
import { authOptions } from "@/lib/auth";
import { getActiveOrganizationMembership } from "@/lib/organizations";
import { getPracticeSetPageData } from "@/lib/problem-page-data";
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
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";

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

  const [locale, organizationMembership, practiceSet] = await Promise.all([
    resolveLocale(),
    getActiveOrganizationMembership(prisma, session.user.id),
    getPracticeSetPageData(problemSetId)
  ]);
  const t = translator(locale);

  if (!practiceSet) {
    notFound();
  }

  const setKind = getTutorUsableSetKind(practiceSet);
  if (!setKind) {
    notFound();
  }

  const practiceSetData = practiceSet;
  const totalProblems = practiceSetData.problems.length;

  // Per-problem attempt status for the badge UI on the list. We pull
  // the latest non-ABANDONED ProblemAttempt for each problem in this
  // set and roll it up into a Map<problemId, "not_started" | "in_progress" | "submitted">.
  // ABANDONED rows are intentionally treated as "not_started" so the
  // student sees a clean slate after they hit Restart.
  const allProblemIds = practiceSetData.problems.map((p) => p.id);
  const accessPromise = isRealExamSet(practiceSetData)
    ? userCanAccessRealTutorProblemSet({
        prisma,
        user: session.user,
        problemSetId: practiceSetData.id
      })
    : Promise.resolve(true);
  const attemptsAndRunPromise: Promise<[
    Array<{ problemId: string; status: string; updatedAt: Date }>,
    { id: string } | null
  ]> =
    totalProblems > 0
      ? Promise.all([
          prisma.problemAttempt.findMany({
            where: {
              userId: session.user.id,
              problemId: { in: allProblemIds },
              status: { in: ["DRAFT", "SUBMITTED"] }
            },
            orderBy: [{ updatedAt: "desc" }],
            select: { problemId: true, status: true, updatedAt: true }
          }),
          prisma.practiceRun.findFirst({
            where: {
              userId: session.user.id,
              problemSetId: practiceSetData.id,
              organizationId: organizationMembership?.organizationId ?? null,
              completedAt: null
            },
            orderBy: { startedAt: "desc" },
            select: { id: true }
          })
        ])
      : Promise.resolve([[], null]);
  const [hasPracticeSetAccess, attemptsAndRun] = await Promise.all([
    accessPromise,
    attemptsAndRunPromise
  ]);
  const [userAttempts, existingRun] = attemptsAndRun;

  if (!hasPracticeSetAccess) {
    // School-pilot has no per-user premium tier; previously this
    // redirected to a /membership demo-unlock flow that's been
    // removed. Send to /unauthorized so the school admin (not the
    // student) is the one who notices.
    redirect("/unauthorized");
  }

  // First occurrence wins because we sorted by updatedAt desc.
  const attemptStatusByProblemId = new Map<string, "in_progress" | "submitted">();
  for (const a of userAttempts) {
    if (attemptStatusByProblemId.has(a.problemId)) continue;
    if (a.status === "DRAFT") {
      attemptStatusByProblemId.set(a.problemId, "in_progress");
    } else if (a.status === "SUBMITTED") {
      attemptStatusByProblemId.set(a.problemId, "submitted");
    }
  }
  const attemptedCount = attemptStatusByProblemId.size;

  // Create-if-missing for the practiceRun. We only fall here when
  // findFirst returned null (no live run for this user+set+org), so
  // this is the warm fast path only on cold-start.
  const practiceRun =
    totalProblems > 0
      ? existingRun ??
        (await prisma.practiceRun.create({
          data: {
            userId: session.user.id,
            problemSetId: practiceSetData.id,
            organizationId: organizationMembership?.organizationId ?? null
          },
          select: { id: true }
        }))
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
                {practiceSetData.exam ? ` ${practiceSetData.exam}` : ""} ·{" "}
                {t("problemset.total_problems", { count: totalProblems })}
                {attemptedCount > 0 ? (
                  <>
                    {" · "}
                    <span style={{ color: "var(--accent-strong)", fontWeight: 600 }}>
                      {t("problemset.progress_summary", {
                        attempted: attemptedCount,
                        total: totalProblems
                      })}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <RouteProgressLink className="btn-secondary" href="/problems">
                {t("problemset.back_to_catalog")}
              </RouteProgressLink>
              {practiceRun && practiceSetData.problems[0] ? (
                <RouteProgressLink
                  className="btn-primary"
                  href={`/problems/${encodeURIComponent(practiceSetData.problems[0].id)}?runId=${encodeURIComponent(practiceRun.id)}`}
                >
                  {t("problemset.start_practice")}
                </RouteProgressLink>
              ) : null}
            </div>
          </div>
        </section>

        <section className="surface-card space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">{t("problemset.problems_heading")}</h2>
            <p className="text-sm text-slate-600">{t("problemset.problem_list_help")}</p>
          </div>

          <div className="space-y-3">
            {practiceSetData.problems.map((problem) => {
              const status = attemptStatusByProblemId.get(problem.id);
              // statusMeta drives the badge color + label key. We keep
              // "not_started" implicit (no badge) — student doesn't need
              // to see a badge on every untouched problem.
              const statusMeta =
                status === "submitted"
                  ? {
                      label: t("problemset.status_submitted"),
                      bg: "var(--success-soft)",
                      color: "var(--success)",
                      borderColor:
                        "color-mix(in srgb, var(--success) 28%, transparent)"
                    }
                  : status === "in_progress"
                    ? {
                        label: t("problemset.status_in_progress"),
                        bg: "var(--surface-2)",
                        color: "var(--accent-strong)",
                        borderColor: "var(--border)"
                      }
                    : null;
              const ctaLabelKey =
                status === "submitted"
                  ? "problemset.cta_review"
                  : status === "in_progress"
                    ? "problemset.cta_continue"
                    : (practiceSetData.tutorEnabled
                        ? "problemset.open_tutor"
                        : "problemset.open_problem");
              return (
                <article key={problem.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-900">
                          {t("problemset.problem_label", { number: problem.number })}
                        </h3>
                        {statusMeta ? (
                          <span
                            className="text-[10px] font-semibold uppercase"
                            style={{
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: statusMeta.bg,
                              color: statusMeta.color,
                              border: `1px solid ${statusMeta.borderColor}`,
                              letterSpacing: "0.08em"
                            }}
                          >
                            {statusMeta.label}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-slate-600">{makeStatementSnippet(problem.statement)}</p>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {problem.difficultyBand ? <span>{problem.difficultyBand}</span> : null}
                        {formatTopicLabel(problem.topicKey) ? <span>{formatTopicLabel(problem.topicKey)}</span> : null}
                      </div>
                    </div>

                    {practiceRun ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {/* For touched problems (submitted OR in_progress),
                            show "Start over" alongside the primary Continue/
                            Review. "Start over" wipes prior attempts after
                            an explicit confirm. */}
                        {(status === "submitted" || status === "in_progress") && (
                          <RestartAttemptButton
                            problemId={problem.id}
                            href={`/problems/${encodeURIComponent(problem.id)}?runId=${encodeURIComponent(practiceRun.id)}`}
                            labels={{
                              button: t("problemset.cta_restart"),
                              confirmTitle: t("problemset.restart_confirm_title"),
                              confirmBody: t("problemset.restart_confirm_body"),
                              confirmYes: t("problemset.restart_confirm_yes"),
                              confirmCancel: t("problemset.restart_confirm_cancel"),
                              inProgress: t("problemset.restart_in_progress"),
                              error: t("problemset.restart_error")
                            }}
                          />
                        )}
                        <RouteProgressLink
                          className="btn-primary"
                          href={`/problems/${encodeURIComponent(problem.id)}?runId=${encodeURIComponent(practiceRun.id)}`}
                        >
                          {t(ctaLabelKey as Parameters<typeof t>[0])}
                        </RouteProgressLink>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
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
            <RouteProgressLink className="btn-secondary" href="/problems">
              Back to Catalog
            </RouteProgressLink>
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
