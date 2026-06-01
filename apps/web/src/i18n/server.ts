import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { cache } from "react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@arcmath/db";
import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale
} from "./dictionary";

export const LOCALE_COOKIE = "arcmath.locale";

/**
 * Server-side locale resolver. Precedence (first hit wins):
 *   1. Explicit cookie set via language switcher.
 *   2. User.locale preference from their DB row (set by user in profile).
 *   3. Their school's Organization.defaultLocale (set by admin).
 *   4. DEFAULT_LOCALE (English).
 *
 * Note: Accept-Language header is intentionally NOT consulted. Product
 * decision: every user — domestic or international — gets English by
 * default. Chinese is opt-in via the language switcher (cookie), the
 * user's profile setting, or an org-level default. Auto-switching off the
 * browser's Accept-Language was confusing for international schools in
 * China where students have Chinese OSes but the curriculum is in English.
 *
 * Called once per request from the root layout. Child server components
 * should receive the resolved locale as a prop instead of re-resolving.
 */
export const resolveLocale = cache(async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieVal)) {
    return cookieVal;
  }

  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        locale: true,
        organizationMemberships: {
          where: { status: "ACTIVE" },
          select: { organization: { select: { defaultLocale: true } } },
          take: 1
        }
      }
    });
    if (isLocale(user?.locale)) return user!.locale;
    const orgDefault = user?.organizationMemberships[0]?.organization.defaultLocale;
    if (isLocale(orgDefault)) return orgDefault;
  }

  return DEFAULT_LOCALE;
});

/**
 * Resolve the user's preferred *feedback* locale (the language used for
 * AI step mentor + final review + hint text). This is INTENTIONALLY
 * decoupled from `resolveLocale()` (which decides the UI language):
 *
 *   - UI language: top-nav switcher cookie → User.locale → org default
 *   - Feedback language: User.feedbackLocale only; defaults to "en"
 *
 * Why split: competition exams are written in English, so we want
 * students (even those reading a Chinese UI) to default to English
 * feedback so the vocabulary lines up with their exam. They can still
 * opt into Chinese feedback explicitly from /account.
 *
 * Returns DEFAULT_LOCALE ("en") for unauthenticated requests or when
 * the user has no explicit preference.
 */
export async function resolveFeedbackLocale(): Promise<Locale> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return DEFAULT_LOCALE;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { feedbackLocale: true }
  });
  if (isLocale(user?.feedbackLocale)) return user!.feedbackLocale as Locale;
  return DEFAULT_LOCALE;
}

/** Same as `resolveFeedbackLocale` but takes an explicit userId — used
 *  by tRPC mutations that already have `ctx.session.user.id`. */
export async function resolveFeedbackLocaleForUser(
  userId: string
): Promise<Locale> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { feedbackLocale: true }
  });
  if (isLocale(user?.feedbackLocale)) return user!.feedbackLocale as Locale;
  return DEFAULT_LOCALE;
}
