"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProblemStatement } from "@/components/problem-statement";
import { RouteProgressLink } from "@/components/route-progress-link";
import { LoadingSpinner } from "@/components/loading-spinner";
import { trpc } from "@/lib/trpc/client";

/**
 * Canvas-style exam workspace for AMC/AIME.
 *
 * Layout: sidebar with 1..N problem numbers (status-coloured), main
 * pane with the current problem statement + answer input. Save persists
 * a DRAFT ProblemAttempt to the DB so refreshing or closing the tab
 * doesn't lose progress. Submit grades the whole set in one server
 * action and redirects to /reports.
 *
 * Why the answer state lives in two places (React + hidden form):
 *   - React state drives the visible inputs and the sidebar status
 *     colour.
 *   - Hidden inputs inside the same <form> as the Submit button carry
 *     the values to the server action — same shape as the existing
 *     `submitDiagnosticRun` action so server-side grading logic stays
 *     unchanged.
 *
 * Why per-problem auto-save on Next/Prev / blur:
 *   - The Save button is the explicit "I'm done" signal, but if a
 *     student types an AMC answer and clicks → Next without pressing
 *     Save, they expect that answer to come back when they reload. We
 *     fire-and-forget a save on blur and on navigation so the DB always
 *     reflects what's currently visible.
 *   - Auto-save errors are silent — the Save button is the user-facing
 *     status signal. We only show the red toast when the explicit Save
 *     button fails.
 */

type Problem = {
  id: string;
  number: number;
  statement: string | null;
  statementFormat: "MARKDOWN_LATEX" | "HTML" | "PLAIN";
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER";
  choices: unknown;
  diagramImageUrl: string | null;
  diagramImageAlt: string | null;
  choicesImageUrl: string | null;
  choicesImageAlt: string | null;
  sourceLabel: string | null;
  savedAnswer: string;
  /** Pre-existing DRAFT ProblemAttempt id, if any. Used as the
   *  hint-request target so hints attach to the right attempt row. */
  draftAttemptId: string | null;
};

type ExamLabels = {
  mockBadge: string;
  practiceBadge: string;
  sidebarHeading: string;
  sidebarHelper: string;
  statusAnswered: string;
  statusBlank: string;
  statusSaving: string;
  problemLabel: string;
  problemLabelTemplate: string;
  answerHeading: string;
  integerPlaceholder: string;
  save: string;
  saved: string;
  saveError: string;
  saving: string;
  /** Template with {time} placeholder, e.g. "Saved at {time}". */
  savedAt: string;
  prev: string;
  next: string;
  submitTitle: string;
  submitHelperMock: string;
  submitHelperPractice: string;
  submit: string;
  submitConfirm: string;
  submitting: string;
  back: string;
  choiceDiagramHeading: string;
  hintTitle: string;
  hintGet: string;
  hintAfter: string;
  hintEmpty: string;
  hintError: string;
  hintMockNote: string;
  hintExhausted: string;
};

type Props = {
  setId: string;
  setTitle: string;
  setSubtitle: string;
  runId: string;
  runMode: "MOCK" | "PRACTICE";
  problems: Problem[];
  submitAction: (formData: FormData) => void | Promise<void>;
  backHref: string;
  labels: ExamLabels;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function normalizeChoiceOptions(
  choices: unknown
): Array<{ label: string; text: string }> {
  if (Array.isArray(choices)) {
    return choices
      .map((choice, index) => ({
        label: String.fromCharCode(65 + index),
        text: typeof choice === "string" ? choice : String(choice ?? "")
      }))
      .filter((c) => c.text.trim().length > 0);
  }
  if (choices && typeof choices === "object") {
    return Object.entries(choices as Record<string, unknown>)
      .map(([label, value]) => ({
        label: label.trim().toUpperCase(),
        text: typeof value === "string" ? value : String(value ?? "")
      }))
      .filter((c) => /^[A-E]$/.test(c.label) && c.text.trim().length > 0);
  }
  return [];
}

export function ExamWorkspace({
  setId: _setId,
  setTitle,
  setSubtitle,
  runId,
  runMode,
  problems,
  submitAction,
  backHref,
  labels
}: Props) {
  const totalProblems = problems.length;
  const [currentIndex, setCurrentIndex] = useState(0);
  // Answers map keyed by problem id. Source of truth for the visible
  // inputs and the hidden form inputs.
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(problems.map((p) => [p.id, p.savedAnswer]))
  );
  // The attempt id is needed for hint requests. Updated on save.
  const [attemptIds, setAttemptIds] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of problems) {
      if (p.draftAttemptId) initial[p.id] = p.draftAttemptId;
    }
    return initial;
  });
  // Global save state for the bottom-of-page status indicator. The old
  // model surfaced per-problem 'Saved ✓' badges + an explicit Save
  // button per problem; both have been removed. New model:
  //   - typing into ANY answer schedules a debounced background save
  //     for that one problem (1s after last keystroke)
  //   - the status string at the bottom of the page shows 'Saving…' or
  //     'Saved at HH:MM' or an error, so the student gets exactly one
  //     signal instead of N
  //   - explicit Save buttons are gone — physically removing the
  //     control removes the perceived "I need to click this before
  //     leaving" friction
  const [globalSaveState, setGlobalSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Per-problem hint state. hints is the ordered list of revealed hint
  // text + level so we can render "Hint 1" / "Hint 2" / etc.
  const [hints, setHints] = useState<
    Record<string, Array<{ level: 1 | 2 | 3; text: string }>>
  >({});
  const [hintPending, setHintPending] = useState<Record<string, boolean>>({});
  const [hintErrors, setHintErrors] = useState<Record<string, string>>({});

  const requestHint = trpc.unifiedAttempt.requestHint.useMutation();

  const currentProblem = problems[currentIndex];
  const formRef = useRef<HTMLFormElement | null>(null);
  // Per-problem debounce timers. Typing in problem X resets X's timer
  // but not Y's, so two problems can have independent pending saves.
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  // Track submit state so the button shows a spinner during the
  // grade-all transaction. The server action triggers a navigation
  // after it completes; we keep `submitting=true` until the redirect
  // happens to avoid double-submit clicks.
  const [submitting, setSubmitting] = useState(false);

  /**
   * Persist a single problem's answer as a DRAFT row. Returns the
   * attempt id on success. Silent failures bubble back up as null so
   * the caller can decide whether to surface them.
   */
  const persistDraft = useCallback(
    async (problemId: string, answer: string): Promise<string | null> => {
      try {
        const res = await fetch(
          `/api/practice-runs/${encodeURIComponent(runId)}/save-draft`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ problemId, answer })
          }
        );
        if (!res.ok) return null;
        const data = (await res.json()) as { ok?: boolean; attemptId?: string };
        if (!data.ok || !data.attemptId) return null;
        // Cache the attempt id so subsequent hint requests don't need
        // another save round-trip.
        setAttemptIds((prev) =>
          prev[problemId] === data.attemptId
            ? prev
            : { ...prev, [problemId]: data.attemptId as string }
        );
        return data.attemptId;
      } catch {
        return null;
      }
    },
    [runId]
  );

  // The save lifecycle, in one place:
  //   - scheduleDebouncedSave: called from setAnswer + onBlur; resets
  //     a per-problem 1-second timer. While it's running, status =
  //     'saving'. When it fires, we POST to /save-draft and flip
  //     status to 'saved' (with a timestamp) on success, 'error'
  //     otherwise. If the user types again before the timer fires
  //     we restart the timer — same as Google Docs / Notion.
  //   - flushPendingSaves: cancels every pending timer and writes
  //     each dirty problem synchronously. Called on Prev/Next so the
  //     student can't lose a draft by navigating before the debounce
  //     fires.
  const runSave = useCallback(
    async (problemId: string, value: string) => {
      setSaveError(null);
      setGlobalSaveState("saving");
      const id = await persistDraft(problemId, value);
      if (id) {
        setGlobalSaveState("saved");
        // toLocaleTimeString without seconds is the minimum-noise
        // form. The student sees "Saved at 14:23" — enough to trust
        // their work is persisted.
        setLastSavedAt(
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          })
        );
      } else {
        setGlobalSaveState("error");
        setSaveError(labels.saveError);
      }
    },
    [labels.saveError, persistDraft]
  );

  const scheduleDebouncedSave = useCallback(
    (problemId: string, value: string) => {
      const existing = saveTimersRef.current.get(problemId);
      if (existing) clearTimeout(existing);
      // Visible "Saving…" indicator goes on the moment the user types,
      // not when the debounce fires. That way the student doesn't
      // wonder during the 1s window whether their work is captured.
      setGlobalSaveState("saving");
      const timer = setTimeout(() => {
        saveTimersRef.current.delete(problemId);
        void runSave(problemId, value);
      }, 1000);
      saveTimersRef.current.set(problemId, timer);
    },
    [runSave]
  );

  const flushPendingSaves = useCallback(() => {
    const pending = Array.from(saveTimersRef.current.entries());
    if (pending.length === 0) return;
    for (const [, timer] of pending) clearTimeout(timer);
    saveTimersRef.current.clear();
    // Save synchronously (well, kick off the fetches). We don't await
    // here — navigation is allowed to proceed; the server write
    // completes in the background.
    for (const [problemId] of pending) {
      void runSave(problemId, answersRef.current[problemId] ?? "");
    }
  }, [runSave]);

  // Stable ref of the latest answers so flushPendingSaves doesn't
  // close over a stale snapshot. Updated below in setAnswer.
  const answersRef = useRef<Record<string, string>>(answers);

  const setAnswer = useCallback(
    (problemId: string, value: string) => {
      setAnswers((prev) => {
        const next = { ...prev, [problemId]: value };
        answersRef.current = next;
        return next;
      });
      scheduleDebouncedSave(problemId, value);
    },
    [scheduleDebouncedSave]
  );

  const navigateTo = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= totalProblems) return;
      // Flush any pending debounced saves so navigation can't leave
      // a draft un-persisted. flushPendingSaves kicks off the writes
      // synchronously but doesn't await — the writes complete in the
      // background while the next problem renders.
      flushPendingSaves();
      setCurrentIndex(nextIndex);
      // Scroll the new problem into view for long statements.
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    },
    [currentIndex, flushPendingSaves, problems, totalProblems]
  );

  const handleRequestHint = useCallback(
    async (problem: Problem) => {
      if (runMode === "MOCK") return;
      const problemId = problem.id;
      setHintErrors((prev) => {
        if (!(problemId in prev)) return prev;
        const next = { ...prev };
        delete next[problemId];
        return next;
      });
      setHintPending((prev) => ({ ...prev, [problemId]: true }));
      try {
        // Ensure we have an attempt id. If the student hasn't saved
        // yet, create a draft with the current value (likely empty),
        // mirroring the unified-workspace flow where a hint can be
        // requested before any work is recorded.
        let attemptId = attemptIds[problemId];
        if (!attemptId) {
          const id = await persistDraft(
            problemId,
            answers[problemId] ?? ""
          );
          if (!id) {
            setHintErrors((prev) => ({
              ...prev,
              [problemId]: labels.hintError
            }));
            setHintPending((prev) => ({ ...prev, [problemId]: false }));
            return;
          }
          attemptId = id;
        }
        const result = await requestHint.mutateAsync({ attemptId });
        const hintText = result?.hint?.hintText ?? "";
        const hintLevel = result?.hint?.hintLevel as 1 | 2 | 3 | undefined;
        if (!hintText || !hintLevel) {
          setHintErrors((prev) => ({
            ...prev,
            [problemId]: labels.hintEmpty
          }));
        } else {
          setHints((prev) => ({
            ...prev,
            [problemId]: [
              ...(prev[problemId] ?? []),
              { level: hintLevel, text: hintText }
            ]
          }));
        }
      } catch (err) {
        // tRPC errors come back as TRPCClientError; we surface their
        // message when present (e.g. "Hints are disabled in Mock
        // mode."), otherwise fall back to the generic copy.
        const message =
          err instanceof Error && err.message ? err.message : labels.hintError;
        setHintErrors((prev) => ({ ...prev, [problemId]: message }));
      } finally {
        setHintPending((prev) => ({ ...prev, [problemId]: false }));
      }
    },
    [
      answers,
      attemptIds,
      labels.hintEmpty,
      labels.hintError,
      persistDraft,
      requestHint,
      runMode
    ]
  );

  // Status the sidebar uses to colour each problem number. With the
  // shift to debounced autosave the "saving" transient state no longer
  // belongs at a single problem (the indicator is global at the bottom
  // of the page), so the sidebar only distinguishes blank vs answered.
  const statusFor = useCallback(
    (problemId: string): "answered" | "blank" => {
      const value = (answers[problemId] ?? "").trim();
      return value.length > 0 ? "answered" : "blank";
    },
    [answers]
  );

  // Tally for the helper text under the sidebar heading.
  const answeredCount = useMemo(
    () =>
      problems.reduce(
        (n, p) => ((answers[p.id] ?? "").trim() ? n + 1 : n),
        0
      ),
    [answers, problems]
  );

  // Keyboard nav: J / K for prev / next (vim-style). Restricted to when
  // an input isn't focused so typing j into an integer field doesn't
  // jump pages.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        navigateTo(currentIndex + 1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        navigateTo(currentIndex - 1);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIndex, navigateTo]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      if (submitting) {
        e.preventDefault();
        return;
      }
      if (!window.confirm(labels.submitConfirm)) {
        e.preventDefault();
        return;
      }
      setSubmitting(true);
      // Don't preventDefault — let the form submit naturally to the
      // server action.
    },
    [labels.submitConfirm, submitting]
  );

  if (!currentProblem) {
    return null;
  }

  const choiceOptions =
    currentProblem.answerFormat === "MULTIPLE_CHOICE"
      ? normalizeChoiceOptions(currentProblem.choices)
      : [];
  const currentAnswer = answers[currentProblem.id] ?? "";
  const currentHints = hints[currentProblem.id] ?? [];
  const currentHintPending = hintPending[currentProblem.id] ?? false;
  const currentHintError = hintErrors[currentProblem.id] ?? null;
  const maxHintLevelReached =
    currentHints.length > 0
      ? Math.max(...currentHints.map((h) => h.level))
      : 0;
  const hintExhausted = maxHintLevelReached >= 3;
  const modeBadge =
    runMode === "MOCK" ? labels.mockBadge : labels.practiceBadge;

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <span
                className="text-[11px] font-semibold uppercase"
                style={{
                  padding: "3px 9px",
                  borderRadius: 999,
                  background:
                    runMode === "MOCK"
                      ? "rgba(15,23,42,0.06)"
                      : "var(--success-soft)",
                  color:
                    runMode === "MOCK" ? "#0f172a" : "var(--success)",
                  border:
                    runMode === "MOCK"
                      ? "1px solid rgba(15,23,42,0.15)"
                      : "1px solid color-mix(in srgb, var(--success) 28%, transparent)",
                  letterSpacing: "0.08em"
                }}
              >
                {modeBadge}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {setTitle}
            </h1>
            <p className="text-sm text-slate-600">{setSubtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RouteProgressLink className="btn-secondary" href={backHref}>
              {labels.back}
            </RouteProgressLink>
          </div>
        </div>
      </section>

      {/* The form wraps both the sidebar + main pane so the hidden
          inputs travel with Submit. The hidden inputs mirror React state
          so the server action sees whatever the student is currently
          looking at, even if they never clicked Save. */}
      <form
        ref={formRef}
        action={submitAction}
        onSubmit={handleSubmit}
        className="grid gap-4 md:grid-cols-[220px_1fr]"
      >
        {problems.map((p) => (
          <input
            key={`hidden-${p.id}`}
            type="hidden"
            name={`answer:${p.id}`}
            value={answers[p.id] ?? ""}
          />
        ))}

        {/* Sidebar */}
        <aside className="surface-card space-y-3 h-fit md:sticky md:top-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">
              {labels.sidebarHeading}
            </h2>
            <p className="text-xs text-slate-500">
              {answeredCount} / {totalProblems} {labels.sidebarHelper}
            </p>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {problems.map((p, idx) => {
              const status = statusFor(p.id);
              const isCurrent = idx === currentIndex;
              const styles: React.CSSProperties = {
                width: "100%",
                aspectRatio: "1 / 1",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                border: "1px solid",
                cursor: "pointer",
                transition: "all 120ms"
              };
              if (isCurrent) {
                styles.background = "var(--accent-strong, #2b6fff)";
                styles.color = "#fff";
                styles.borderColor = "var(--accent-strong, #2b6fff)";
              } else if (status === "answered") {
                styles.background = "var(--success-soft)";
                styles.color = "var(--success)";
                styles.borderColor =
                  "color-mix(in srgb, var(--success) 28%, transparent)";
              } else {
                styles.background = "white";
                styles.color = "#475569";
                styles.borderColor = "#e2e8f0";
              }
              const ariaLabel =
                status === "answered"
                  ? `${p.number} · ${labels.statusAnswered}`
                  : `${p.number} · ${labels.statusBlank}`;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigateTo(idx)}
                  style={styles}
                  aria-label={ariaLabel}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  {p.number}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main pane */}
        <div className="space-y-4">
          <section className="surface-card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {labels.problemLabelTemplate.trim()} {currentProblem.number}
              </h2>
              {currentProblem.sourceLabel ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Source · {currentProblem.sourceLabel}
                </span>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <ProblemStatement
                statement={currentProblem.statement}
                statementFormat={currentProblem.statementFormat}
              />
            </div>

            {currentProblem.diagramImageUrl ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <img
                  src={currentProblem.diagramImageUrl}
                  alt={
                    currentProblem.diagramImageAlt ??
                    `Problem ${currentProblem.number} diagram`
                  }
                  className="mx-auto max-h-[28rem] w-auto max-w-full rounded-lg"
                  loading="lazy"
                />
              </div>
            ) : null}

            {currentProblem.choicesImageUrl ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {labels.choiceDiagramHeading}
                </p>
                <img
                  src={currentProblem.choicesImageUrl}
                  alt={
                    currentProblem.choicesImageAlt ??
                    `Problem ${currentProblem.number} answer choices`
                  }
                  className="mx-auto max-h-[24rem] w-auto max-w-full rounded-lg"
                  loading="lazy"
                />
              </div>
            ) : null}

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-700">
                {labels.answerHeading}
              </legend>
              {currentProblem.answerFormat === "MULTIPLE_CHOICE" ? (
                <div className="space-y-2">
                  {choiceOptions.map((choice) => {
                    const checked = currentAnswer === choice.label;
                    return (
                      <label
                        key={`${currentProblem.id}-${choice.label}`}
                        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm hover:bg-slate-50"
                        style={
                          checked
                            ? {
                                borderColor: "var(--accent-strong, #2b6fff)",
                                background: "rgba(43,111,255,0.04)"
                              }
                            : undefined
                        }
                      >
                        <input
                          type="radio"
                          name={`canvas-mc-${currentProblem.id}`}
                          value={choice.label}
                          checked={checked}
                          onChange={() =>
                            setAnswer(currentProblem.id, choice.label)
                          }
                        />
                        <span className="flex-1 space-y-1 text-slate-700">
                          <span className="block font-semibold text-slate-500">
                            {choice.label}.
                          </span>
                          {!currentProblem.choicesImageUrl ? (
                            <ProblemStatement
                              statement={choice.text}
                              statementFormat="MARKDOWN_LATEX"
                              compact
                              choice
                            />
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <input
                  className="input-field"
                  type="text"
                  inputMode="numeric"
                  placeholder={labels.integerPlaceholder}
                  value={currentAnswer}
                  autoComplete="off"
                  onChange={(e) =>
                    setAnswer(currentProblem.id, e.target.value)
                  }
                />
              )}
            </fieldset>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigateTo(currentIndex - 1)}
                  disabled={currentIndex === 0}
                >
                  ← {labels.prev}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigateTo(currentIndex + 1)}
                  disabled={currentIndex === totalProblems - 1}
                >
                  {labels.next} →
                </button>
              </div>
              {/* Global save status — replaces the per-problem Save
                  button. Goes 'Saving…' the moment the student types,
                  'Saved at HH:MM' a second after they stop, or red
                  error on failure. Subtle on purpose: the indicator
                  exists so the student trusts the system, not so they
                  feel pressured to click anything. */}
              <div className="flex items-center gap-2 text-xs">
                {globalSaveState === "saving" ? (
                  <span
                    className="inline-flex items-center gap-2"
                    style={{ color: "var(--muted)" }}
                  >
                    <LoadingSpinner />
                    {labels.saving}
                  </span>
                ) : globalSaveState === "saved" && lastSavedAt ? (
                  <span style={{ color: "var(--success)" }}>
                    ✓ {labels.savedAt.replace("{time}", lastSavedAt)}
                  </span>
                ) : globalSaveState === "error" ? (
                  <span style={{ color: "#dc2626" }}>
                    {labels.saveError}
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          {/* Hint panel — Practice mode only. In Mock mode the panel
              renders a single-line note so the student understands why
              hints aren't available without having to guess. */}
          <section className="surface-card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {labels.hintTitle}
              </h3>
              {runMode === "MOCK" ? (
                <span className="text-xs text-slate-500">
                  {labels.hintMockNote}
                </span>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleRequestHint(currentProblem)}
                  disabled={currentHintPending || hintExhausted}
                >
                  {currentHintPending ? (
                    <span className="inline-flex items-center gap-2">
                      <LoadingSpinner />
                      {labels.hintGet}
                    </span>
                  ) : currentHints.length === 0 ? (
                    labels.hintGet
                  ) : hintExhausted ? (
                    labels.hintExhausted
                  ) : (
                    labels.hintAfter
                  )}
                </button>
              )}
            </div>
            {currentHintError ? (
              <p className="text-sm" style={{ color: "#dc2626" }}>
                {currentHintError}
              </p>
            ) : null}
            {currentHints.length === 0 && !currentHintError ? null : (
              <ol className="space-y-3">
                {currentHints.map((h, i) => (
                  <li
                    key={`${currentProblem.id}-hint-${i}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                  >
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Hint {h.level}
                    </span>
                    <div className="mt-1">
                      <ProblemStatement
                        statement={h.text}
                        statementFormat="MARKDOWN_LATEX"
                        compact
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Submit panel — last card on the page so students see it
              when they navigate to the final problem, but it's always
              accessible via the sidebar Submit shortcut below the grid
              count. */}
          <section className="surface-card space-y-3">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900">
                {labels.submitTitle}
              </h3>
              <p className="text-sm text-slate-600">
                {runMode === "MOCK"
                  ? labels.submitHelperMock
                  : labels.submitHelperPractice}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {answeredCount} / {totalProblems}
              </p>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <LoadingSpinner />
                    {labels.submitting}
                  </span>
                ) : (
                  labels.submit
                )}
              </button>
            </div>
            {saveError ? (
              <p className="text-xs" style={{ color: "#dc2626" }}>
                {saveError}
              </p>
            ) : null}
          </section>
        </div>
      </form>
    </main>
  );
}
