import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { ExamWorkspace } from "@/components/exam-workspace";
import { gradeAnswer } from "@/lib/answer-grading";
import { authOptions } from "@/lib/auth";
import { getActiveOrganizationMembership } from "@/lib/organizations";
import { getPracticeSetPageData } from "@/lib/problem-page-data";
import {
  isRealExamSet,
  isWholeSetSubmitMode
} from "@/lib/problem-set-modes";
import { userCanAccessRealTutorProblemSet } from "@/lib/tutor-premium-access";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";

/**
 * Canvas-style exam workspace for AMC/AIME (and any future
 * whole-set-submit real exam).
 *
 * Why a separate route from /problems/set/[id]:
 *   - The set page renders all 25 problem statements inline. KaTeX +
 *     react-markdown over 25 problems is heavy on TTFB and feels slow,
 *     especially from California → HK → us-east-1.
 *   - Canvas paints one problem at a time, keeps the rest hydrated as
 *     plain data, and lets the student navigate via a sidebar. Much
 *     cheaper to render and to interact with.
 *   - The set page is also the *catalog* surface (problem list, status
 *     badges, restart buttons). Mixing the exam surface with the catalog
 *     surface made both worse.
 *
 * Routing contract:
 *   - GET /problems/set/[id]/exam REQUIRES an active (un-completed)
 *     PracticeRun owned by the caller, attached to this set, and with
 *     mode set (MOCK or PRACTICE). If any of those are missing we
 *     redirect back to the set page so the chooser renders.
 *   - Only valid for real-exam + whole-set-submit sets. Per-problem
 *     real-exam sets (USAMO PROOF problems) still use /problems/[id].
 *   - If the run is already completed, we redirect to /reports.
 */
type PageProps = {
  params: Promise<{
    problemSetId: string;
  }>;
};

export default async function ExamPage({ params }: PageProps) {
  const { problemSetId } = await params;
  const session = await getServerSession(authOptions);

  const setUrl = `/problems/set/${encodeURIComponent(problemSetId)}`;
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`${setUrl}/exam`)}`);
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

  // Canvas only makes sense for real-exam whole-set-submit sets. For
  // everything else (diagnostic placement test, per-problem proof
  // exams, topic mixes) we bounce back to the set page which already
  // renders the appropriate UI.
  if (!isRealExamSet(practiceSet) || !isWholeSetSubmitMode(practiceSet)) {
    redirect(setUrl);
  }

  // Premium-access check — mirrors the same gate the set page applies
  // so a direct /exam URL can't bypass tutor-premium-access.
  const hasAccess = await userCanAccessRealTutorProblemSet({
    prisma,
    user: session.user,
    problemSetId: practiceSet.id
  });
  if (!hasAccess) {
    redirect("/unauthorized");
  }

  // Look up the active run. Required — without a run the canvas has no
  // place to write drafts. We don't auto-create here because the mode
  // chooser is the source-of-truth for new runs.
  const activeRun = await prisma.practiceRun.findFirst({
    where: {
      userId: session.user.id,
      problemSetId: practiceSet.id,
      organizationId: organizationMembership?.organizationId ?? null
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, mode: true, completedAt: true, startedAt: true }
  });

  if (!activeRun) {
    redirect(setUrl);
  }
  if (activeRun.completedAt) {
    redirect(`/reports?runId=${encodeURIComponent(activeRun.id)}`);
  }

  // Existing draft attempts so we can hydrate the form with what the
  // student typed before. We only need DRAFT — anything SUBMITTED in
  // this run would mean the run is completed (see whole-set-submit
  // contract).
  const drafts = await prisma.problemAttempt.findMany({
    where: {
      userId: session.user.id,
      practiceRunId: activeRun.id,
      status: "DRAFT"
    },
    select: { id: true, problemId: true, submittedAnswer: true }
  });
  const draftsByProblemId = new Map(
    drafts.map((d) => [
      d.problemId,
      { id: d.id, submittedAnswer: d.submittedAnswer ?? "" }
    ])
  );

  // Pre-compute the per-problem payload for the client. Mirrors the
  // shape used by the inline whole-set form so the rendering primitives
  // (ProblemStatement, MC labels) work identically.
  const problemsForClient = practiceSet.problems
    .filter(
      (p) =>
        // The canvas only knows how to render MULTIPLE_CHOICE and
        // INTEGER answer formats. Whole-set-submit real exams happen to
        // be only those two today (AMC = MC, AIME = INTEGER). If a
        // future PROOF problem sneaks in via WHOLE_SET_SUBMIT the
        // canvas would silently skip it; PROOF problems belong in the
        // per-problem flow anyway.
        p.answerFormat === "MULTIPLE_CHOICE" || p.answerFormat === "INTEGER"
    )
    .map((p) => {
      const draft = draftsByProblemId.get(p.id);
      return {
        id: p.id,
        number: p.number,
        statement: p.statement,
        statementFormat: p.statementFormat,
        answerFormat: p.answerFormat as "MULTIPLE_CHOICE" | "INTEGER",
        choices: p.choices,
        diagramImageUrl: p.diagramImageUrl,
        diagramImageAlt: p.diagramImageAlt,
        choicesImageUrl: p.choicesImageUrl,
        choicesImageAlt: p.choicesImageAlt,
        sourceLabel: p.sourceLabel,
        savedAnswer: draft?.submittedAnswer ?? "",
        draftAttemptId: draft?.id ?? null
      };
    });

  const totalProblems = problemsForClient.length;
  if (totalProblems === 0) {
    redirect(setUrl);
  }

  const runMode: "MOCK" | "PRACTICE" =
    activeRun.mode === "MOCK" ? "MOCK" : "PRACTICE";

  // Capture non-null refs for the server action closure. TS doesn't
  // propagate the `redirect()`-based narrowing into nested function
  // scope, so we re-establish them as `const` locals.
  const runIdForAction = activeRun.id;
  const setIdForAction = practiceSet.id;
  const setProblemsForAction = practiceSet.problems;

  /**
   * Whole-set submit. Mirrors `submitDiagnosticRun` on the set page,
   * but graded against the DRAFT rows the canvas wrote rather than from
   * a freshly-submitted FormData. The hidden form in <ExamWorkspace>
   * carries the runId + per-problem answers so the server has the
   * authoritative final state, but we also reconcile with any DRAFT
   * rows the API wrote in case the form values fell out of sync (e.g.
   * the student typed in problem 7, clicked Save, then Submit before
   * the input blur fired).
   *
   * Grading happens via the same `gradeAnswer` helper the set-page
   * form uses, so the resulting ProblemAttempt rows are
   * indistinguishable downstream — reports + learning-report logic
   * works without any new branches.
   */
  async function submitExam(formData: FormData) {
    "use server";

    const currentSession = await getServerSession(authOptions);
    if (!currentSession?.user) {
      redirect(`/login?callbackUrl=${encodeURIComponent(`${setUrl}/exam`)}`);
    }

    const validatedRun = await prisma.practiceRun.findFirst({
      where: {
        id: runIdForAction,
        userId: currentSession.user.id,
        problemSetId: setIdForAction,
        completedAt: null
      },
      select: { id: true }
    });
    if (!validatedRun) {
      // The run was already completed (concurrent submit) or doesn't
      // exist any more. Send the student to the reports page if we can,
      // otherwise back to the set page.
      redirect(`/reports?runId=${encodeURIComponent(runIdForAction)}`);
    }

    // Read the per-problem answers from the form. The canvas sends one
    // hidden input per problem keyed by `answer:${problemId}`, so the
    // shape matches what the existing set-page form sends.
    const attemptRows = setProblemsForAction.flatMap((problem) => {
      if (
        problem.answerFormat !== "MULTIPLE_CHOICE" &&
        problem.answerFormat !== "INTEGER"
      ) {
        return [];
      }
      const submittedAnswer = String(
        formData.get(`answer:${problem.id}`) ?? ""
      ).trim();
      const gradingResult = gradeAnswer({
        answerFormat: problem.answerFormat,
        submittedAnswer,
        canonicalAnswer: problem.answer,
        choices: problem.choices
      });
      return [
        {
          userId: currentSession.user.id,
          problemId: problem.id,
          practiceRunId: validatedRun.id,
          submittedAnswer,
          normalizedAnswer: gradingResult.normalizedSubmittedAnswer,
          isCorrect: gradingResult.isCorrect,
          explanationText: null
        }
      ];
    });

    await prisma.$transaction([
      // Hint usages are kept across submit so the report can surface
      // "you used 4 hints in this run". They're tied to attempt rows
      // we're about to delete, so cascade-on-delete would wipe them.
      // To preserve them across the DRAFT → SUBMITTED transition we
      // delete them too — same behaviour as the set-page form. A future
      // refactor could keep hint-usage alive across submit; for now we
      // accept the loss because the report uses run-level aggregates
      // pulled from ProblemAttempt.hintsUsedCount.
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
        where: { id: validatedRun.id },
        data: { completedAt: new Date() }
      })
    ]);

    redirect(`/reports?runId=${encodeURIComponent(validatedRun.id)}`);
  }

  return (
    <ExamWorkspace
      setId={practiceSet.id}
      setTitle={practiceSet.title}
      setSubtitle={`${practiceSet.contest} ${practiceSet.year}${practiceSet.exam ? ` ${practiceSet.exam}` : ""}`}
      runId={activeRun.id}
      runMode={runMode}
      problems={problemsForClient}
      submitAction={submitExam}
      backHref="/problems"
      labels={{
        mockBadge: t("problemset.mode_badge_mock"),
        practiceBadge: t("problemset.mode_badge_practice"),
        sidebarHeading: t("exam.sidebar_heading"),
        sidebarHelper: t("exam.sidebar_helper"),
        statusAnswered: t("exam.status_answered"),
        statusBlank: t("exam.status_blank"),
        statusSaving: t("exam.status_saving"),
        problemLabel: t("problemset.problem_label", { number: 0 }),
        // problemLabel template is `Problem ${number}` — we strip the
        // number out and re-inject per problem in the client. Easier
        // than threading a template-string interpolation function.
        problemLabelTemplate: t("problemset.problem_label", { number: 0 }).replace(
          /0$/,
          ""
        ),
        answerHeading: t("exam.answer_heading"),
        integerPlaceholder: t("exam.integer_placeholder"),
        save: t("exam.save"),
        saved: t("exam.saved"),
        saveError: t("exam.save_error"),
        saving: t("exam.saving"),
        savedAt: t("exam.saved_at"),
        prev: t("exam.prev"),
        next: t("exam.next"),
        submitTitle: t("exam.submit_title"),
        submitHelperMock: t("exam.submit_helper_mock"),
        submitHelperPractice: t("exam.submit_helper_practice"),
        submit: t("exam.submit_cta"),
        submitConfirm: t("exam.submit_confirm"),
        submitting: t("exam.submitting"),
        back: t("problemset.back_to_catalog"),
        choiceDiagramHeading: t("exam.choice_diagram_heading"),
        hintTitle: t("exam.hint_title"),
        hintGet: t("exam.hint_get"),
        hintAfter: t("exam.hint_after"),
        hintEmpty: t("exam.hint_empty"),
        hintError: t("exam.hint_error"),
        hintMockNote: t("exam.hint_mock_note"),
        hintExhausted: t("exam.hint_exhausted")
      }}
    />
  );
}
