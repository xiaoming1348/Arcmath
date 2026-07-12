import { NextResponse } from "next/server";
import { LOCALE_COOKIE } from "@/i18n/server";
import { isLocale, type Locale } from "@/i18n/dictionary";
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

  const response = NextResponse.json({ ok: true, locale });
  setLocaleCookie(response, locale);
  await persistUserLocale(locale);

  return response;
}

/**
 * GET /api/locale?locale=en
 *
 * Link fallback for the top-nav switcher. This makes language switching work
 * even when a user clicks before the client bundle finishes hydrating.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale");
  if (!isLocale(locale)) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const response = NextResponse.redirect(resolveSafeReturnUrl(request, url));
  setLocaleCookie(response, locale);
  await persistUserLocale(locale);
  return response;
}

function setLocaleCookie(response: NextResponse, locale: Locale) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    // 180 days — long enough that a student doesn't re-pick every
    // semester, short enough that stale prefs on a shared device
    // eventually expire.
    maxAge: 60 * 60 * 24 * 180,
    sameSite: "lax"
  });
}

async function persistUserLocale(locale: Locale) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return;

  await prisma.user
    .update({ where: { id: session.user.id }, data: { locale } })
    .catch(() => {
      // If the user row was just deleted we swallow — the cookie has
      // already been set, the client will reload, and the next
      // session build will drop them to login.
    });
}

function resolveSafeReturnUrl(request: Request, currentUrl: URL) {
  const fallback = new URL("/", currentUrl.origin);
  const referer = request.headers.get("referer");
  if (!referer) return fallback;

  try {
    const returnUrl = new URL(referer);
    if (returnUrl.origin !== currentUrl.origin) return fallback;
    return returnUrl;
  } catch {
    return fallback;
  }
}
