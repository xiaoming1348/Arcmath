"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { trpc } from "@/lib/trpc/client";

type AnswerWorkspaceProps = {
  problemId: string;
  practiceRunId?: string | null;
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";
  choiceOptions: Array<{
    label: string;
    text: string;
  }>;
  showChoiceText?: boolean;
};

function normalizeAnswerExplanationText(raw: string | null): string {
  return (raw ?? "")
    .trim()
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function normalizeChoiceForDisplay(raw: string | null): string {
  const normalized = normalizeAnswerExplanationText(raw)
    .replace(/\s+([,.;:?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]])/g, "$1");

  if (normalized.includes("$")) {
    return normalized;
  }

  const looksLikeCompactMath =
    normalized.length <= 80 &&
    /^[0-9a-zA-Z\\^_{}()+\-<>=.,/%:\s]+$/u.test(normalized) &&
    !/[.!?]$/u.test(normalized);

  if (!looksLikeCompactMath) {
    return normalized;
  }

  const latex = normalized
    .replace(/\(([^()]+)\)\/\(([^()]+)\)/gu, "\\frac{$1}{$2}")
    .replace(/sqrt\(([^()]+)\)/gu, "\\sqrt{$1}")
    .replace(/\bpi\b/gu, "\\pi")
    .replace(/(\d)\s*\\sqrt\{/gu, "$1\\sqrt{")
    .replace(/\}\s+\\sqrt\{/gu, "}\\sqrt{");

  return `$${latex}$`;
}

function AnswerRichText({ text }: { text: string | null }) {
  return (
    <div className="problem-statement text-sm leading-7 text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>
        }}
      >
        {normalizeAnswerExplanationText(text)}
      </ReactMarkdown>
    </div>
  );
}

function ChoiceText({ text }: { text: string }) {
  return (
    <div className="problem-statement text-sm leading-7 text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>
        }}
      >
        {normalizeChoiceForDisplay(text)}
      </ReactMarkdown>
    </div>
  );
}

export function AnswerWorkspace({
  problemId,
  practiceRunId,
  answerFormat,
  choiceOptions,
  showChoiceText = true
}: AnswerWorkspaceProps) {
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState<string | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitAttempt = trpc.hintTutor.submitAttempt.useMutation();
  const useChoiceInput = answerFormat === "MULTIPLE_CHOICE" && choiceOptions.length > 0;

  async function onSubmitAnswer() {
    setError(null);

    try {
      const result = await submitAttempt.mutateAsync({
        problemId,
        submittedAnswer: answer,
        practiceRunId: practiceRunId ?? undefined
      });

      setExplanation(result.explanation);
      setCorrectAnswer(result.correctAnswer ?? null);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Unable to submit answer.");
    }
  }

  return (
    <section className="surface-card space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Answer Workspace</h2>
          <span className="badge">Do this first if you can</span>
        </div>
        <p className="text-sm text-slate-600">
          Try the problem directly here. If you can make progress on your own, you do not need the tutor panel yet.
        </p>
      </div>

      {useChoiceInput ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Select your answer</legend>
          <div className="space-y-2">
            {choiceOptions.map((choice) => {
              const isSelected = answer === choice.label;

              return (
                <label
                  key={`${choice.label}-${choice.text}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm transition ${
                    isSelected
                      ? "border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,white)] shadow-[0_10px_24px_rgba(30,102,245,0.08)]"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name={`problem-answer-${problemId}`}
                    value={choice.label}
                    checked={isSelected}
                    onChange={(event) => setAnswer(event.target.value)}
                  />
                  <span className="flex-1 space-y-1 text-slate-700">
                    <span className="block font-semibold text-slate-500">{choice.label}.</span>
                    {showChoiceText ? <ChoiceText text={choice.text} /> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <label className="block text-sm text-slate-700">
          Your Answer
          <input
            className="input-field mt-2"
            type="text"
            placeholder="Type your answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
        </label>
      )}

      <button
        type="button"
        className="btn-primary w-full"
        onClick={onSubmitAnswer}
        disabled={submitAttempt.isPending || answer.trim().length === 0}
      >
        {submitAttempt.isPending ? "Submitting..." : "Submit Answer"}
      </button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {explanation ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Post-attempt explanation</p>
          <div className="mt-2">
            <AnswerRichText text={explanation} />
          </div>
          {correctAnswer ? (
            <p className="mt-2 text-sm font-medium text-slate-900">Expected answer: {correctAnswer}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
