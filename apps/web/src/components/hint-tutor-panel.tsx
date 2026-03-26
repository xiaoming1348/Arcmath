"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { trpc } from "@/lib/trpc/client";

type TutorIntent = "HELP_START" | "CHECK_STEP" | "SMALLER_HINT";

type HintTutorPanelProps = {
  problemId: string;
  practiceRunId?: string | null;
};

function coerceTutorIntent(value: string | null | undefined): TutorIntent {
  if (value === "CHECK_STEP" || value === "SMALLER_HINT") {
    return value;
  }

  return "HELP_START";
}

function getIntentOptions(hasTutorHistory: boolean): Array<{
  value: TutorIntent;
  label: string;
  description: string;
}> {
  if (!hasTutorHistory) {
    return [
      {
        value: "HELP_START",
        label: "No idea at all",
        description: "Use this when you do not know how to begin or what the problem is really asking for."
      },
      {
        value: "CHECK_STEP",
        label: "I tried something and got stuck",
        description: "Use this when you already have a setup, count, equation, or geometric idea and want feedback."
      }
    ];
  }

  return [
    {
      value: "SMALLER_HINT",
      label: "I need another hint",
      description: "Use this when the tutor has already responded and you want one more nudge."
    },
    {
      value: "CHECK_STEP",
      label: "I tried something and got stuck",
      description: "Use this when you already have a setup, count, equation, or geometric idea and want feedback."
    }
  ];
}

function normalizeTutorDisplayText(raw: string | null): string {
  const sanitized = (raw ?? "").trim();

  return sanitized
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;:?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]])/g, "$1")
    .trim();
}

function normalizePreviewText(raw: string | null): string {
  const normalized = normalizeTutorDisplayText(raw);

  if (normalized.includes("$")) {
    return normalized;
  }

  const looksLikeCompactMath =
    normalized.length <= 160 &&
    /^[0-9a-zA-Z\\^_{}()+\-<>=.,/%:\s]+$/u.test(normalized) &&
    !/[.!?]$/u.test(normalized);

  if (!looksLikeCompactMath) {
    return normalized;
  }

  const latex = normalized
    .replace(/\(([^()]+)\)\/\(([^()]+)\)/gu, "\\frac{$1}{$2}")
    .replace(/sqrt\(([^()]+)\)/gu, "\\sqrt{$1}")
    .replace(/\bpi\b/gu, "\\pi");

  return `$${latex}$`;
}

function TutorRichText({ text }: { text: string | null }) {
  const normalized = normalizeTutorDisplayText(text);

  return (
    <div className="problem-statement text-sm leading-7 text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-6 space-y-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 space-y-2">{children}</ol>,
          li: ({ children }) => <li>{children}</li>
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

function getIntentLabel(intent: string | null | undefined): string {
  switch (intent) {
    case "CHECK_STEP":
      return "Tried something and got stuck";
    case "CHECK_ANSWER_IDEA":
      return "Checking an answer idea";
    case "SMALLER_HINT":
      return "Need another hint";
    case "HELP_START":
    default:
      return "No idea at all";
  }
}

function getIntentPlaceholder(intent: TutorIntent): string {
  switch (intent) {
    case "CHECK_STEP":
      return "Briefly describe your attempt and where it stopped working. Example: I set x+y=12, but I do not know how to use the second condition.";
    case "SMALLER_HINT":
      return "Briefly say what still feels unclear.";
    case "HELP_START":
    default:
      return "Say what feels unclear. Example: I do not know what quantity I should track first.";
  }
}

function getIntentHelper(intent: TutorIntent): string {
  switch (intent) {
    case "CHECK_STEP":
      return "Write the step you tried. The tutor should tell you whether the direction is reasonable, what to watch for, or whether to change direction.";
    case "SMALLER_HINT":
      return "Use this only after the tutor has already responded and you need one more nudge.";
    case "HELP_START":
    default:
      return "Use this if you truly have no productive first step yet.";
  }
}

function insertAtCursor(
  currentValue: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  snippet: string
): { nextValue: string; nextCursor: number } {
  const start = selectionStart ?? currentValue.length;
  const end = selectionEnd ?? currentValue.length;
  const nextValue = `${currentValue.slice(0, start)}${snippet}${currentValue.slice(end)}`;
  return {
    nextValue,
    nextCursor: start + snippet.length
  };
}

export function HintTutorPanel({ problemId, practiceRunId }: HintTutorPanelProps) {
  const [composerText, setComposerText] = useState("");
  const [selectedIntent, setSelectedIntent] = useState<TutorIntent>("HELP_START");
  const [error, setError] = useState<string | null>(null);
  const [textSelection, setTextSelection] = useState<{ start: number | null; end: number | null }>({
    start: null,
    end: null
  });

  const utils = trpc.useUtils();
  const sessionQuery = trpc.hintTutor.getSessionState.useQuery({
    problemId,
    practiceRunId: practiceRunId ?? undefined
  });
  const respond = trpc.hintTutor.respond.useMutation();

  useEffect(() => {
    if (sessionQuery.data?.currentIntent) {
      setSelectedIntent(coerceTutorIntent(sessionQuery.data.currentIntent));
    }
  }, [sessionQuery.data?.currentIntent]);

  const turns = sessionQuery.data?.turns ?? [];
  const hintLevel = sessionQuery.data?.currentHintLevel ?? 0;
  const sessionId = sessionQuery.data?.sessionId ?? undefined;
  const hasTutorHistory = turns.some((turn) => turn.actor === "TUTOR");
  const intentOptions = useMemo(() => getIntentOptions(hasTutorHistory), [hasTutorHistory]);

  const composerPreview = useMemo(() => {
    if (selectedIntent !== "CHECK_STEP") {
      return null;
    }

    if (!composerText.trim()) {
      return null;
    }

    return normalizePreviewText(composerText);
  }, [composerText, selectedIntent]);

  useEffect(() => {
    if (!intentOptions.some((option) => option.value === selectedIntent)) {
      setSelectedIntent(intentOptions[0]?.value ?? "HELP_START");
    }
  }, [intentOptions, selectedIntent]);

  async function refreshSessionState() {
    await utils.hintTutor.getSessionState.invalidate({
      problemId,
      practiceRunId: practiceRunId ?? undefined
    });
  }

  async function onSendTutorMessage() {
    setError(null);

    try {
      await respond.mutateAsync({
        problemId,
        practiceRunId: practiceRunId ?? undefined,
        sessionId,
        intent: selectedIntent,
        studentMessage: composerText.trim(),
        draftAnswer: undefined
      });

      setComposerText("");
      await refreshSessionState();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Unable to contact the tutor.");
    }
  }

  async function onRequestQuickTutorResponse(intent: Exclude<TutorIntent, "CHECK_STEP">) {
    setError(null);
    setSelectedIntent(intent);

    try {
      await respond.mutateAsync({
        problemId,
        practiceRunId: practiceRunId ?? undefined,
        sessionId,
        intent,
        studentMessage:
          intent === "HELP_START"
            ? "I have no idea how to start this problem yet."
            : "Please give me a smaller hint than before.",
        draftAnswer: undefined
      });

      await refreshSessionState();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Unable to contact the tutor.");
    }
  }

  function onInsertSnippet(snippet: string) {
    const next = insertAtCursor(composerText, textSelection.start, textSelection.end, snippet);
    setComposerText(next.nextValue);
    setTextSelection({
      start: next.nextCursor,
      end: next.nextCursor
    });
  }

  return (
    <section className="surface-card space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Hint Tutor</h2>
          <span className="badge">Interactive</span>
        </div>
        <p className="text-sm text-slate-600">
          If you cannot solve the problem directly, choose the state that best matches you, then briefly explain your attempt or what feels unclear.
        </p>
      </div>

      <div className="rounded-2xl border border-[rgba(30,102,245,0.18)] bg-[linear-gradient(180deg,rgba(30,102,245,0.08),rgba(30,102,245,0.02))] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Current mode</p>
            <p className="text-sm text-slate-700">{getIntentLabel(selectedIntent)}</p>
          </div>
          <div className="rounded-2xl border border-white/60 bg-white/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Hint level {hintLevel || 1}
          </div>
        </div>

        <div className="grid gap-2">
          {intentOptions.map((option) => {
            const isSelected = selectedIntent === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedIntent(option.value)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  isSelected
                    ? "border-[var(--accent)] bg-white shadow-[0_10px_24px_rgba(30,102,245,0.08)]"
                    : "border-slate-200 bg-white/70 hover:border-slate-300"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                <p className="mt-1 text-xs text-slate-600">{option.description}</p>
              </button>
            );
          })}
          {selectedIntent === "CHECK_STEP" ? (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <label className="block text-sm text-slate-700">
              Message to tutor
              <textarea
                className="input-field mt-2 min-h-28"
                placeholder={getIntentPlaceholder(selectedIntent)}
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
                onSelect={(event) => {
                  const target = event.target as HTMLTextAreaElement;
                  setTextSelection({
                    start: target.selectionStart,
                    end: target.selectionEnd
                  });
                }}
              />
            </label>

            <p className="text-xs text-slate-500">{getIntentHelper(selectedIntent)}</p>

            <div className="flex flex-wrap gap-2">
              {["^", "/", "sqrt()", "pi", "<=", ">="].map((snippet) => (
                <button
                  key={snippet}
                  type="button"
                  className="btn-secondary px-3 py-2 text-xs"
                  onClick={() => onInsertSnippet(snippet)}
                >
                  {snippet}
                </button>
              ))}
            </div>

            {composerPreview ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Math preview</p>
                <TutorRichText text={composerPreview} />
              </div>
            ) : null}

            <button
              type="button"
              className="btn-primary w-full"
              onClick={onSendTutorMessage}
              disabled={respond.isPending || composerText.trim().length === 0}
            >
              {respond.isPending ? "Sending..." : "Submit to Tutor"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => void onRequestQuickTutorResponse(selectedIntent)}
            disabled={respond.isPending}
          >
            {respond.isPending ? "Sending..." : "Submit to Tutor"}
          </button>
        )}
      </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tutor thread</p>
            {sessionQuery.isFetching ? <p className="text-xs text-slate-500">Refreshing…</p> : null}
          </div>

          <div className="space-y-3">
            {turns.length > 0 ? (
              turns.map((turn) => (
                <div
                  key={turn.id}
                  className={`rounded-2xl px-4 py-3 ${
                    turn.actor === "TUTOR"
                      ? "border border-[rgba(30,102,245,0.18)] bg-white"
                      : "border border-slate-200 bg-[rgba(255,255,255,0.6)]"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {turn.actor === "TUTOR" ? "Tutor" : "You"}
                    </p>
                    {turn.intent ? (
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {getIntentLabel(turn.intent)}
                      </p>
                    ) : null}
                  </div>
                  <TutorRichText text={turn.rawText} />
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-600">
                No tutor turns yet. First choose whether you have no idea at all or whether you already tried something and got stuck.
              </p>
            )}
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
