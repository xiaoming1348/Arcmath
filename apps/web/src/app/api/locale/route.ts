import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/i18n/server";
import { isLocale } from "@/i18n/dictionary";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@arcmath/db";

/**
 * POST /api/locale
 * Body: { locale: "en" | "zh" }
 *
 * Sets the locale cookie for the session AND, if the user is logged in,
 * persists to User.locale so their next device picks it up. Rejects
 * unknown locales.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const locale = (body as { locale?: unknown })?.locale;
  if (!isLocale(locale)) {
    return NextResponse.json(
      { error: "Unsupported locale" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    // 180 days — long enough that a student doesn't re-pick every
    // semester, short enough that stale prefs on a shared device
    // eventually expire.
    maxAge: 60 * 60 * 24 * 180,
    sameSite: "lax"
  });

  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    await prisma.user
      .update({ where: { id: session.user.id }, data: { locale } })
      .catch(() => {
        // If the user row was just deleted we swallow — the cookie has
        // already been set, the client will reload, and the next
        // session build will drop them to login.
      });
  }

  return NextResponse.json({ ok: true, locale });
}
