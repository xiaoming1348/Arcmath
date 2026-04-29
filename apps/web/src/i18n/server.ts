import { cookies, headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@arcmath/db";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  type Locale
} from "./dictionary";

export const LOCALE_COOKIE = "arcmath.locale";

/**
 * Server-side locale resolver. Precedence (first hit wins):
 *   1. Explicit cookie set via language switcher.
 *   2. User.locale preference from their DB row.
 *   3. Their school's Organization.defaultLocale.
 *   4. Accept-Language header (first supported match).
 *   5. DEFAULT_LOCALE.
 *
 * Called once per request from the root layout. Child server components
 * should receive the resolved locale as a prop instead of re-resolving.
 */
export async function resolveLocale(): Promise<Locale> {
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

  const headerStore = await headers();
  const accept = headerStore.get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const tag = part.trim().split(";")[0]?.toLowerCase() ?? "";
    // "zh", "zh-CN", "zh-Hans" → zh. "en", "en-US" → en.
    const prefix = tag.split("-")[0];
    if ((SUPPORTED_LOCALES as readonly string[]).includes(prefix)) {
      return prefix as Locale;
    }
  }

  return DEFAULT_LOCALE;
}
