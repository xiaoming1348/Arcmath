"use client";

import type { ReactNode } from "react";
import { TRPCProvider } from "@/lib/trpc/provider";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/dictionary";

export function Providers({
  locale,
  children
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <LocaleProvider locale={locale}>
      <TRPCProvider>{children}</TRPCProvider>
    </LocaleProvider>
  );
}
