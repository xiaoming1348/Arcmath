"use client";

import { useSetLocale, useT } from "@/i18n/client";

/**
 * Minimal language toggle used in the top nav. Two buttons — EN / 中文.
 * Tapping one POSTs to /api/locale and reloads the page so server
 * components re-render with the new dictionary.
 *
 * We intentionally don't use a dropdown; with only two languages the
 * segmented control is clearer and works better on mobile.
 */
export function LanguageSwitcher() {
  const { locale, t } = useT();
  const setLocale = useSetLocale();
  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-xs"
      aria-label={t("topnav.language")}
    >
      <button
        type="button"
        onClick={() => {
          if (locale !== "en") void setLocale("en");
        }}
        aria-pressed={locale === "en"}
        className={`rounded px-1.5 py-0.5 transition-colors ${
          locale === "en"
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => {
          if (locale !== "zh") void setLocale("zh");
        }}
        aria-pressed={locale === "zh"}
        className={`rounded px-1.5 py-0.5 transition-colors ${
          locale === "zh"
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        中文
      </button>
    </div>
  );
}
