"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";

/**
 * Switcher for the AI-feedback language. Intentionally a separate
 * component from `LanguageSwitcher` because:
 *
 *   - UI language (LanguageSwitcher) → cookie + User.locale, controls
 *     top nav / buttons / problem-set chrome.
 *   - Feedback language (this) → User.feedbackLocale only, controls
 *     the tutor / step mentor / hint output.
 *
 * Lives on /account. POSTs to /api/feedback-locale and triggers a
 * router refresh so the next round of grading uses the new pref.
 *
 * Defaults to "en" (no value selected highlights EN) because the
 * competition exams themselves are written in English.
 */
export function FeedbackLanguageSwitcher({
  initial
}: {
  initial: "en" | "zh";
}) {
  const { t } = useT();
  const router = useRouter();
  const [current, setCurrent] = useState<"en" | "zh">(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handle = async (next: "en" | "zh") => {
    if (next === current) return;
    setError(null);
    setCurrent(next);
    try {
      const res = await fetch("/api/feedback-locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body?.error ?? "Save failed");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      // Roll back the optimistic UI on failure.
      setCurrent(initial);
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="space-y-2">
      <div
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-xs"
        aria-label={t("account.feedback_language_heading")}
      >
        <button
          type="button"
          onClick={() => void handle("en")}
          aria-pressed={current === "en"}
          disabled={isPending}
          className={`rounded px-1.5 py-0.5 transition-colors ${
            current === "en"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => void handle("zh")}
          aria-pressed={current === "zh"}
          disabled={isPending}
          className={`rounded px-1.5 py-0.5 transition-colors ${
            current === "zh"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          中文
        </button>
      </div>
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
