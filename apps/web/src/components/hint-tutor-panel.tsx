"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

type HintTutorPanelProps = {
  problemId: string;
  practiceRunId?: string | null;
  answerFormat: "MULTIPLE_CHOICE" | "INTEGER" | "EXPRESSION";
  choiceOptions: Array<{
    label: string;
    text: string;
  }>;
};

export function HintTutorPanel({ problemId, practiceRunId, answerFormat, choiceOptions }: HintTutorPanelProps) {
  const [answer, setAnswer] = useState("");
  const [hintLevel, setHintLevel] = useState<number | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getNextHint = trpc.hintTutor.getNextHint.useMutation();
  const submitAttempt = trpc.hintTutor.submitAttempt.useMutation();
  const useChoiceInput = answerFormat === "MULTIPLE_CHOICE" && choiceOptions.length > 0;

  async function onRequestHint() {
    setError(null);

    try {
      const result = await getNextHint.mutateAsync({
        problemId,
        draftAnswer: answer.trim() || undefined,
        practiceRunId: practiceRunId ?? undefined
      });

      setHintLevel(result.hintLevel);
      setHintText(result.hintText);
      setExhausted(result.exhausted);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Unable to load hint.");
    }
  }

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
          <h2 className="text-lg font-semibold text-slate-900">Hint Tutor</h2>
          <span className="badge">Mock API</span>
        </div>
        <p className="text-sm text-slate-600">
          Ask for progressive hints, then submit your answer to get a short post-attempt explanation.
        </p>
      </div>

      <div className="space-y-3">
        {useChoiceInput ? (
          <fieldset className="space-y-2">
            <legend className="text-sm text-slate-700">Your Answer</legend>
            <div className="space-y-2">
              {choiceOptions.map((choice) => {
                const isSelected = answer === choice.label;

                return (
                  <label
                    key={`${choice.label}-${choice.text}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm transition ${
                      isSelected
                        ? "border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,white)]"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="problem-answer"
                      value={choice.label}
                      checked={isSelected}
                      onChange={(event) => setAnswer(event.target.value)}
                    />
                    <span className="space-x-2 text-slate-700">
                      <span className="font-semibold text-slate-500">{choice.label}.</span>
                      <span>{choice.text}</span>
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
              className="input-field"
              type="text"
              placeholder="Type your answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
            />
          </label>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onRequestHint}
            disabled={getNextHint.isPending || exhausted}
          >
            {getNextHint.isPending ? "Loading hint..." : exhausted ? "Max hints reached" : "I'm stuck"}
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={onSubmitAnswer}
            disabled={submitAttempt.isPending || answer.trim().length === 0}
          >
            {submitAttempt.isPending ? "Submitting..." : "Submit Answer"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {hintText ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Hint Level {hintLevel}
          </p>
          <p className="mt-2 text-sm text-amber-900">{hintText}</p>
        </div>
      ) : null}

      {explanation ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Post-attempt explanation</p>
          <p className="mt-2 text-sm text-slate-700">{explanation}</p>
          {correctAnswer ? (
            <p className="mt-2 text-sm font-medium text-slate-900">Expected answer: {correctAnswer}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
