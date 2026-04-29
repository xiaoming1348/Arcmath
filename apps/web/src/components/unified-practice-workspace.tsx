"use client";

import { useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { trpc } from "@/lib/trpc/client";
import { MathFieldEditor } from "@/components/math-field-editor";

type UnifiedPracticeWorkspaceProps = {
  problemId: string;
  practiceRunId?: string | null;
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION" | "PROOF";
  choiceOptions: Array<{ label: string; text: string }>;
  // Per-assignment hint-tutor gate. Defaults to `true` so the
  // self-directed practice flow (TOPIC_PRACTICE / contest browser)
  // keeps its current behaviour. The teacher-assignment surface
  // passes `false` for assignments where the teacher unchecked the
  // hint-tutor toggle, in which case the entire hint UI is hidden
  // and the requestHint mutation is never sent.
  hintTutorEnabled?: boolean;
};

type EntryMode = "ANSWER_ONLY" | "STUCK_WITH_WORK" | "HINT_GUIDED" | "PROOF_STEPS";
type AttemptStatus = "DRAFT" | "SUBMITTED" | "ABANDONED";

type StepRecord = {
  id: string;
  stepIndex: number;
  latexInput: string;
  classifiedStepType: string;
  verificationBackend: string;
  verdict: string;
  confidence: number | null;
  feedbackText: string | null;
  verificationDetails: unknown;
  createdAt: string | Date;
};

type HintRecord = {
  id: string;
  hintLevel: number;
  hintText: string;
  createdAt: string | Date;
};

type AttemptState = {
  id: string;
  status: AttemptStatus;
  entryMode: EntryMode | null;
  selfReport: string | null;
  hintsUsedCount: number;
  submittedAnswer: string | null;
  normalizedAnswer: string | null;
  isCorrect: boolean;
  explanationText: string | null;
  overallFeedback: string | null;
  submittedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  steps: StepRecord[];
  hintHistory: HintRecord[];
};

// Structured review data returned by the submit mutation. We stash it
// on client-side state so SubmittedReview can render a per-milestone
// checklist next to the free-form overallFeedback. This is in-memory
// only — on page refresh (where getState rehydrates from DB), the
// checklist disappears and the student falls back to reading the
// text-folded copy in overallFeedback. Persisting this survives-refresh
// is a separate task (add a milestoneCoverage JSON column on
// ProblemAttempt).
type MilestoneCoverageEntry = {
  index: number;
  status: string;
  evidence: string;
};

type RecipeStepMeta = {
  index: number;
  title: string;
  technique: string[];
};

type ReviewExtras = {
  milestoneCoverage: MilestoneCoverageEntry[];
  recipeSteps: RecipeStepMeta[];
};

const VERDICT_META: Record<
  string,
  { label: string; tone: "verified" | "plausible" | "unknown" | "invalid" | "error" | "pending"; icon: string }
> = {
  VERIFIED: { label: "Verified", tone: "verified", icon: "✓" },
  PLAUSIBLE: { label: "Plausible", tone: "plausible", icon: "⚠" },
  UNKNOWN: { label: "Unverified", tone: "unknown", icon: "?" },
  INVALID: { label: "Invalid", tone: "invalid", icon: "✗" },
  ERROR: { label: "Parse error", tone: "error", icon: "!" },
  PENDING: { label: "Not yet checked", tone: "pending", icon: "…" }
};

const VERDICT_CLASSES: Record<"verified" | "plausible" | "unknown" | "invalid" | "error" | "pending", string> = {
  verified: "border-emerald-200 bg-emerald-50 text-emerald-800",
  plausible: "border-amber-200 bg-amber-50 text-amber-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
  invalid: "border-red-200 bg-red-50 text-red-800",
  error: "border-red-200 bg-red-50 text-red-800",
  pending: "border-slate-200 bg-slate-50 text-slate-500"
};

function VerdictBadge({ verdict, backend }: { verdict: string; backend: string }) {
  const meta = VERDICT_META[verdict] ?? VERDICT_META.PENDING;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${VERDICT_CLASSES[meta.tone]}`}
      title={`Checked by ${backend}`}
    >
      <span aria-hidden>{meta.icon}</span>
      <span>{meta.label}</span>
      {verdict !== "PENDING" ? (
        <span className="font-normal text-[10px] uppercase tracking-wide opacity-70">{backend}</span>
      ) : null}
    </span>
  );
}

function Markdown({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="problem-statement text-sm leading-6 text-slate-700">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function renderLatexBlock(latex: string): string {
  const trimmed = latex.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("$") || trimmed.startsWith("\\[")) return trimmed;
  return `$$${trimmed}$$`;
}

function StepCard({
  step,
  locked,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  busy
}: {
  step: StepRecord;
  locked: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (latex: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const rendered = useMemo(() => renderLatexBlock(step.latexInput), [step.latexInput]);
  const showVerdict = step.verdict !== "PENDING";
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">Step {step.stepIndex + 1}</span>
        {showVerdict ? (
          <span className="opacity-60">{step.classifiedStepType.replaceAll("_", " ").toLowerCase()}</span>
        ) : null}
        <span className="ml-auto">
          <VerdictBadge verdict={step.verdict} backend={step.verificationBackend} />
        </span>
      </div>

      {isEditing ? (
        <div className="mt-3">
          <MathFieldEditor
            initialValue={step.latexInput}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            onDelete={onDelete}
            saveLabel="Save step"
            busy={busy}
            autoFocus
          />
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="problem-statement text-sm leading-7 text-slate-800">
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {rendered}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {showVerdict && step.feedbackText ? (
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tutor note</p>
          <div className="mt-1">
            <Markdown text={step.feedbackText} />
          </div>
        </div>
      ) : null}

      {!isEditing && !locked ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <button type="button" className="btn-secondary" onClick={onStartEdit}>
            Edit
          </button>
          <button type="button" className="text-slate-500 hover:text-red-600" onClick={onDelete}>
            Delete
          </button>
        </div>
      ) : null}
    </li>
  );
}

function EntryChooser({
  onChoose,
  busy
}: {
  onChoose: (params: { entryMode: EntryMode; selfReport: "SOLVED_CONFIDENT" | "ATTEMPTED_STUCK" | "NO_IDEA" }) => void;
  busy: boolean;
}) {
  const cards: Array<{
    entryMode: EntryMode;
    selfReport: "SOLVED_CONFIDENT" | "ATTEMPTED_STUCK" | "NO_IDEA";
    title: string;
    desc: string;
    accent: string;
  }> = [
    {
      entryMode: "ANSWER_ONLY",
      selfReport: "SOLVED_CONFIDENT",
      title: "I've solved it",
      desc: "You're confident — submit your answer and get it graded.",
      accent: "border-emerald-300 hover:bg-emerald-50"
    },
    {
      entryMode: "STUCK_WITH_WORK",
      selfReport: "ATTEMPTED_STUCK",
      title: "I tried but got stuck",
      desc: "Write the steps you tried (LaTeX editor). We'll review each step and help you finish.",
      accent: "border-amber-300 hover:bg-amber-50"
    },
    {
      entryMode: "HINT_GUIDED",
      selfReport: "NO_IDEA",
      title: "I have no idea",
      desc: "We'll give you progressive hints. You can switch to writing steps any time.",
      accent: "border-sky-300 hover:bg-sky-50"
    }
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Try the problem on paper first. Then tell us how it went — we'll tailor the feedback to match.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.entryMode}
            type="button"
            disabled={busy}
            onClick={() => onChoose({ entryMode: c.entryMode, selfReport: c.selfReport })}
            className={`flex flex-col items-start gap-2 rounded-2xl border-2 bg-white p-4 text-left transition ${c.accent}`}
          >
            <span className="font-semibold text-slate-900">{c.title}</span>
            <span className="text-xs text-slate-600">{c.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AnswerOnlyInput({
  answerFormat,
  choiceOptions,
  onSubmit,
  busy
}: {
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";
  choiceOptions: Array<{ label: string; text: string }>;
  onSubmit: (answer: string) => void;
  busy: boolean;
}) {
  const [answer, setAnswer] = useState("");
  const trimmed = answer.trim();

  if (answerFormat === "MULTIPLE_CHOICE" && choiceOptions.length > 0) {
    return (
      <div className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Select your answer</legend>
          {choiceOptions.map((c) => (
            <label
              key={c.label}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm transition ${
                answer === c.label
                  ? "border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,white)]"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="mc-answer"
                value={c.label}
                checked={answer === c.label}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <span className="flex-1 text-slate-700">
                <span className="block font-semibold text-slate-500">{c.label}.</span>
                <Markdown text={c.text} />
              </span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={trimmed.length === 0 || busy}
          onClick={() => onSubmit(trimmed)}
        >
          {busy ? "Submitting…" : "Submit answer"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm text-slate-700">
        Your answer
        <input
          className="input-field mt-2"
          type="text"
          placeholder={answerFormat === "INTEGER" ? "Integer, e.g. 42" : "Your answer"}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn-primary w-full"
        disabled={trimmed.length === 0 || busy}
        onClick={() => onSubmit(trimmed)}
      >
        {busy ? "Submitting…" : "Submit answer"}
      </button>
    </div>
  );
}

export function UnifiedPracticeWorkspace({
  problemId,
  practiceRunId,
  answerFormat,
  choiceOptions,
  hintTutorEnabled = true
}: UnifiedPracticeWorkspaceProps) {
  const utils = trpc.useUtils();
  const stateQuery = trpc.unifiedAttempt.getState.useQuery(
    { problemId, practiceRunId: practiceRunId ?? undefined },
    { refetchOnWindowFocus: false }
  );

  const chooseEntry = trpc.unifiedAttempt.chooseEntry.useMutation();
  const upgradeMode = trpc.unifiedAttempt.upgradeMode.useMutation();
  const addStep = trpc.unifiedAttempt.addStep.useMutation();
  const editStep = trpc.unifiedAttempt.editStep.useMutation();
  const deleteStep = trpc.unifiedAttempt.deleteStep.useMutation();
  const requestHint = trpc.unifiedAttempt.requestHint.useMutation();
  const submit = trpc.unifiedAttempt.submit.useMutation();
  const startNew = trpc.unifiedAttempt.startNewAttempt.useMutation();

  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [finalAnswer, setFinalAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Held only for the *most recent* submission from this page load.
  // getState does NOT return this today — it's not persisted.
  const [reviewExtras, setReviewExtras] = useState<ReviewExtras | null>(null);

  const attempt = (stateQuery.data?.attempt ?? null) as AttemptState | null;

  const refresh = useCallback(async () => {
    await utils.unifiedAttempt.getState.invalidate({
      problemId,
      practiceRunId: practiceRunId ?? undefined
    });
  }, [utils, problemId, practiceRunId]);

  const handleChoose = async (params: {
    entryMode: EntryMode;
    selfReport: "SOLVED_CONFIDENT" | "ATTEMPTED_STUCK" | "NO_IDEA";
  }) => {
    setError(null);
    try {
      await chooseEntry.mutateAsync({
        problemId,
        practiceRunId: practiceRunId ?? undefined,
        entryMode: params.entryMode,
        selfReport: params.selfReport
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start attempt.");
    }
  };

  const handleUpgradeMode = async (newMode: EntryMode) => {
    if (!attempt) return;
    setError(null);
    try {
      await upgradeMode.mutateAsync({ attemptId: attempt.id, entryMode: newMode });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change mode.");
    }
  };

  const handleAddStep = async (latex: string) => {
    if (!attempt) return;
    setError(null);
    try {
      await addStep.mutateAsync({ attemptId: attempt.id, latexInput: latex });
      setComposerKey((k) => k + 1);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add step.");
    }
  };

  const handleEditStep = async (latex: string) => {
    if (!editingStepId) return;
    setError(null);
    try {
      await editStep.mutateAsync({ stepId: editingStepId, latexInput: latex });
      setEditingStepId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to edit step.");
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    setError(null);
    try {
      await deleteStep.mutateAsync({ stepId });
      if (editingStepId === stepId) setEditingStepId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete step.");
    }
  };

  const handleRequestHint = async () => {
    if (!attempt) return;
    setError(null);
    try {
      await requestHint.mutateAsync({ attemptId: attempt.id });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch hint.");
    }
  };

  const handleSubmit = async () => {
    if (!attempt) return;
    setError(null);
    try {
      const result = await submit.mutateAsync({
        attemptId: attempt.id,
        finalAnswer: finalAnswer.trim().length > 0 ? finalAnswer.trim() : undefined
      });
      setReviewExtras({
        milestoneCoverage: result.milestoneCoverage ?? [],
        recipeSteps: result.recipeSteps ?? []
      });
      setFinalAnswer("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit.");
    }
  };

  const handleStartNew = async () => {
    setError(null);
    try {
      await startNew.mutateAsync({ problemId, practiceRunId: practiceRunId ?? undefined });
      setFinalAnswer("");
      setEditingStepId(null);
      setComposerKey((k) => k + 1);
      setReviewExtras(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start new attempt.");
    }
  };

  // Pre-attempt entry chooser (skipped for proof problems).
  if (!attempt && answerFormat !== "PROOF") {
    return (
      <section className="surface-card space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Answer Workspace</h2>
        </div>
        {stateQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <EntryChooser onChoose={handleChoose} busy={chooseEntry.isPending} />
        )}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </section>
    );
  }

  // Proof problems auto-initialize as PROOF_STEPS.
  if (!attempt && answerFormat === "PROOF") {
    const autoInit = async () => {
      await handleChoose({ entryMode: "PROOF_STEPS", selfReport: "ATTEMPTED_STUCK" });
    };
    return (
      <section className="surface-card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Proof Workspace</h2>
        <p className="text-sm text-slate-600">Write your proof one step at a time. Nothing is verified until you submit.</p>
        <button type="button" className="btn-primary" onClick={autoInit} disabled={chooseEntry.isPending}>
          {chooseEntry.isPending ? "Starting…" : "Start proof attempt"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </section>
    );
  }

  if (!attempt) return null;

  const locked = attempt.status !== "DRAFT";
  const mode: EntryMode = attempt.entryMode ?? (answerFormat === "PROOF" ? "PROOF_STEPS" : "ANSWER_ONLY");
  const steps = attempt.steps;
  const hintHistory = attempt.hintHistory;
  const hintsExhausted = hintHistory.length >= 3;

  const showSteps =
    mode === "STUCK_WITH_WORK" ||
    mode === "PROOF_STEPS" ||
    (mode === "HINT_GUIDED" && steps.length > 0);
  const showAnswerField =
    answerFormat !== "PROOF" &&
    (mode === "ANSWER_ONLY" || mode === "STUCK_WITH_WORK" || mode === "HINT_GUIDED");

  return (
    <section className="surface-card space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            {answerFormat === "PROOF" ? "Proof Workspace" : "Answer Workspace"}
          </h2>
          <ModeBadge mode={mode} locked={locked} />
        </div>
        {!locked ? (
          <p className="text-sm text-slate-600">
            {mode === "ANSWER_ONLY"
              ? "You told us you've solved it — submit your answer below."
              : mode === "STUCK_WITH_WORK"
                ? "Write the steps you tried. Submit when you're ready — we'll check each one."
                : mode === "HINT_GUIDED"
                  ? "Take hints one at a time. Switch to writing steps or typing an answer whenever you're ready."
                  : "Build your proof step by step. Everything gets verified on submit."}
          </p>
        ) : null}
      </div>

      {/* Hint history (for HINT_GUIDED, or if stuck-mode student also asked for hints).
          Suppressed when the parent assignment turned hints off — historical
          hints from prior runs would otherwise leak through. */}
      {hintTutorEnabled && hintHistory.length > 0 ? (
        <div className="space-y-2">
          {hintHistory.map((h) => (
            <div key={h.id} className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-slate-800">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-700">
                Hint {h.hintLevel}
              </p>
              <Markdown text={h.hintText} />
            </div>
          ))}
        </div>
      ) : null}

      {/* Steps list */}
      {showSteps && steps.length > 0 ? (
        <ol className="space-y-3">
          {steps.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              locked={locked}
              isEditing={editingStepId === step.id}
              onStartEdit={() => setEditingStepId(step.id)}
              onCancelEdit={() => setEditingStepId(null)}
              onSaveEdit={handleEditStep}
              onDelete={() => handleDeleteStep(step.id)}
              busy={editStep.isPending || deleteStep.isPending}
            />
          ))}
        </ol>
      ) : null}

      {/* Step composer */}
      {!locked && showSteps && editingStepId === null ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
          <p className="mb-2 text-sm font-semibold text-slate-700">Add step {steps.length + 1}</p>
          <MathFieldEditor
            key={composerKey}
            initialValue=""
            onSave={handleAddStep}
            saveLabel="Add step"
            busy={addStep.isPending}
          />
        </div>
      ) : null}

      {/* Final answer field (for non-proof, non-ANSWER_ONLY we show it pre-submit) */}
      {!locked && showAnswerField ? (
        mode === "ANSWER_ONLY" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
            <AnswerOnlyInput
              answerFormat={answerFormat as "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION"}
              choiceOptions={choiceOptions}
              onSubmit={(a) => {
                setFinalAnswer(a);
                submit
                  .mutateAsync({ attemptId: attempt.id, finalAnswer: a })
                  .then((result) => {
                    setReviewExtras({
                      milestoneCoverage: result.milestoneCoverage ?? [],
                      recipeSteps: result.recipeSteps ?? []
                    });
                    setFinalAnswer("");
                    return refresh();
                  })
                  .catch((err) => setError(err instanceof Error ? err.message : "Failed to submit."));
              }}
              busy={submit.isPending}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <label className="block text-sm text-slate-700">
              Final answer (optional — submit only if you're reasonably confident)
              <input
                className="input-field mt-2"
                type="text"
                placeholder="Leave blank if you didn't reach a confident answer"
                value={finalAnswer}
                onChange={(e) => setFinalAnswer(e.target.value)}
              />
            </label>
          </div>
        )
      ) : null}

      {/* Mode switching + hint button (only for non-ANSWER_ONLY, non-proof).
          The hint-tutor gate hides every hint button. Mode-switch buttons
          (write steps / got an answer) stay visible because they're not
          AI-assisted — students should still be able to change strategy. */}
      {!locked && answerFormat !== "PROOF" && mode !== "ANSWER_ONLY" ? (
        <div className="flex flex-wrap items-center gap-2">
          {mode === "HINT_GUIDED" ? (
            <>
              {hintTutorEnabled ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRequestHint}
                  disabled={requestHint.isPending || hintsExhausted}
                >
                  {requestHint.isPending
                    ? "Loading hint…"
                    : hintsExhausted
                      ? "All 3 hints used"
                      : `Show hint ${hintHistory.length + 1}`}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleUpgradeMode("STUCK_WITH_WORK")}
                disabled={upgradeMode.isPending}
              >
                I'll try writing steps now
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleUpgradeMode("ANSWER_ONLY")}
                disabled={upgradeMode.isPending}
              >
                I've got an answer
              </button>
            </>
          ) : mode === "STUCK_WITH_WORK" ? (
            <>
              {hintTutorEnabled && !hintsExhausted ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRequestHint}
                  disabled={requestHint.isPending}
                >
                  {requestHint.isPending ? "Loading hint…" : `Stuck — show hint ${hintHistory.length + 1}`}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {/* Submit row (for modes that aren't already using inline submit) */}
      {!locked && mode !== "ANSWER_ONLY" ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-sm text-slate-600">
            {mode === "PROOF_STEPS"
              ? "Done writing? We'll verify each step and give you an overall review."
              : "Submit when you're ready. We'll review every step and grade your answer if you wrote one."}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submit.isPending}
          >
            {submit.isPending ? "Grading…" : "Submit for review"}
          </button>
        </div>
      ) : null}

      {/* Post-submit results */}
      {locked ? (
        <SubmittedReview
          attempt={attempt}
          answerFormat={answerFormat}
          reviewExtras={reviewExtras}
          onStartNew={handleStartNew}
          startBusy={startNew.isPending}
        />
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}

function ModeBadge({ mode, locked }: { mode: EntryMode; locked: boolean }) {
  const labels: Record<EntryMode, string> = {
    ANSWER_ONLY: "Direct answer",
    STUCK_WITH_WORK: "With work",
    HINT_GUIDED: "Hints",
    PROOF_STEPS: "Proof"
  };
  return (
    <span className="badge">
      {labels[mode]} {locked ? "· submitted" : ""}
    </span>
  );
}

// Styling for milestone-coverage statuses. Mirrors the step-verdict
// palette (emerald = good, amber = partial credit, red = wrong path,
// slate = didn't reach it) so the two views feel consistent. REPLACED
// gets its own sky/blue tone — student found a valid alternate path the
// recipe didn't anticipate, which is worth highlighting as a positive
// distinct from "matched the recipe exactly".
const COVERAGE_META: Record<
  string,
  { label: string; icon: string; classes: string }
> = {
  ESTABLISHED: {
    label: "Established",
    icon: "✓",
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800"
  },
  REPLACED: {
    label: "Replaced (alt path)",
    icon: "↻",
    classes: "border-sky-200 bg-sky-50 text-sky-800"
  },
  PARTIAL: {
    label: "Partial",
    icon: "◐",
    classes: "border-amber-200 bg-amber-50 text-amber-800"
  },
  MISSING: {
    label: "Not reached",
    icon: "○",
    classes: "border-slate-200 bg-slate-50 text-slate-600"
  },
  INVALID: {
    label: "Contradicted",
    icon: "✗",
    classes: "border-red-200 bg-red-50 text-red-800"
  }
};

function MilestoneCoverageChecklist({
  coverage,
  recipeSteps
}: {
  coverage: MilestoneCoverageEntry[];
  recipeSteps: RecipeStepMeta[];
}) {
  if (coverage.length === 0) return null;
  // Merge recipe title + technique tags with coverage entries by index.
  // If recipeSteps is empty (older server, or solutionRecipe unavailable)
  // we still render the status pills with bare indices.
  const byIndex = new Map<number, RecipeStepMeta>();
  for (const s of recipeSteps) byIndex.set(s.index, s);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Milestone coverage
      </p>
      <ul className="space-y-2">
        {coverage
          .slice()
          .sort((a, b) => a.index - b.index)
          .map((c) => {
            const meta = COVERAGE_META[c.status] ?? COVERAGE_META.MISSING;
            const step = byIndex.get(c.index);
            return (
              <li
                key={c.index}
                className={`rounded-xl border p-3 ${meta.classes}`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span aria-hidden className="text-base leading-none">
                    {meta.icon}
                  </span>
                  <span className="uppercase tracking-wide">{meta.label}</span>
                  <span className="opacity-70">Milestone #{c.index}</span>
                  {step?.technique && step.technique.length > 0 ? (
                    <span className="ml-auto flex flex-wrap gap-1 text-[10px] font-medium opacity-70">
                      {step.technique.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-current/30 bg-white/60 px-1.5 py-0.5"
                        >
                          {t}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>
                {step?.title ? (
                  <p className="mt-1 text-sm font-semibold">{step.title}</p>
                ) : null}
                {c.evidence ? (
                  <p className="mt-1 text-sm leading-6 opacity-90">{c.evidence}</p>
                ) : null}
              </li>
            );
          })}
      </ul>
    </div>
  );
}

// Strip the "Milestone coverage:\n ..." block we append server-side to
// overallFeedback. When we render the structured checklist we don't
// want the bullet dump showing up twice.
function stripFoldedCoverage(text: string | null): string | null {
  if (!text) return text;
  const idx = text.indexOf("\n\nMilestone coverage:\n");
  if (idx === -1) return text;
  return text.slice(0, idx);
}

function SubmittedReview({
  attempt,
  answerFormat,
  reviewExtras,
  onStartNew,
  startBusy
}: {
  attempt: AttemptState;
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION" | "PROOF";
  reviewExtras: ReviewExtras | null;
  onStartNew: () => void;
  startBusy: boolean;
}) {
  const verifiedCount = attempt.steps.filter((s) => s.verdict === "VERIFIED").length;
  const invalidCount = attempt.steps.filter((s) => s.verdict === "INVALID" || s.verdict === "ERROR").length;
  const softCount = attempt.steps.filter((s) => s.verdict === "PLAUSIBLE" || s.verdict === "UNKNOWN").length;

  const hasStructuredCoverage = (reviewExtras?.milestoneCoverage?.length ?? 0) > 0;
  const feedbackForDisplay = hasStructuredCoverage
    ? stripFoldedCoverage(attempt.overallFeedback)
    : attempt.overallFeedback;

  return (
    <div className="space-y-3">
      {answerFormat !== "PROOF" && attempt.submittedAnswer !== null ? (
        <div
          className={`rounded-2xl border p-3 ${
            attempt.isCorrect
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide">
            Answer: {attempt.isCorrect ? "✓ correct" : "✗ not correct"}
          </p>
          <p className="mt-1 text-sm">
            Your answer: <span className="font-semibold">{attempt.submittedAnswer}</span>
          </p>
          {!attempt.isCorrect && attempt.explanationText ? (
            <div className="mt-2">
              <Markdown text={attempt.explanationText} />
            </div>
          ) : null}
        </div>
      ) : null}

      {attempt.steps.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
            ✓ {verifiedCount}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
            ⚠ {softCount}
          </span>
          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-medium text-red-700">
            ✗ {invalidCount}
          </span>
          {attempt.submittedAt ? (
            <span className="ml-auto text-slate-500">
              Submitted {new Date(attempt.submittedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      ) : null}

      {hasStructuredCoverage ? (
        <MilestoneCoverageChecklist
          coverage={reviewExtras!.milestoneCoverage}
          recipeSteps={reviewExtras!.recipeSteps}
        />
      ) : null}

      {feedbackForDisplay ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Overall review</p>
          <Markdown text={feedbackForDisplay} />
        </div>
      ) : null}

      {attempt.hintsUsedCount > 0 ? (
        <p className="text-xs text-slate-500">
          Hints used in this attempt: {attempt.hintsUsedCount}
        </p>
      ) : null}

      <button type="button" className="btn-secondary w-full" onClick={onStartNew} disabled={startBusy}>
        {startBusy ? "Starting…" : "Start a new attempt"}
      </button>
    </div>
  );
}
