"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  MESSAGES,
  formatMessage,
  type Locale,
  type Messages
} from "./dictionary";

type LocaleContextValue = {
  locale: Locale;
  t: (key: keyof Messages, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  children
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo<LocaleContextValue>(() => {
    const dict = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
    return {
      locale,
      t: (key, vars) => formatMessage(dict[key] ?? key, vars)
    };
  }, [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Client-side translation hook. Throws if called outside LocaleProvider
 *  to catch wiring bugs early — silently returning the English fallback
 *  would mask missing providers in new routes. */
export function useT() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useT must be used inside <LocaleProvider>");
  }
  return ctx;
}

/** Server- or client-safe helper for callers that already have the
 *  locale in hand (e.g. top-level server components that read the
 *  locale cookie). Mirrors the hook's `t` without needing context. */
export function translator(locale: Locale) {
  const dict = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  return (
    key: keyof Messages,
    vars?: Record<string, string | number>
  ): string => formatMessage(dict[key] ?? key, vars);
}

/** Small helper for the language switcher. We POST to /api/locale which
 *  sets an HttpOnly-free cookie, then hard-reload so server components
 *  re-render with the new dictionary. */
export function useSetLocale() {
  return useCallback(async (next: Locale) => {
    await fetch("/api/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: next })
    });
    // Force a full reload so server-rendered text swaps immediately.
    // This is a tradeoff vs. an in-memory context swap: we get correct
    // SSR text (incl. DB-fetched server components) at the cost of a
    // page flash. For a pilot this is fine.
    if (typeof window !== "undefined") window.location.reload();
  }, []);
}
