import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@arcmath/db";
import { isLocale } from "@/i18n/dictionary";

/**
 * POST /api/feedback-locale
 * Body: { locale: "en" | "zh" }
 *
 * Sets the user's AI-feedback language preference. This is distinct
 * from the UI language (see /api/locale): the UI switcher is the
 * top-nav segmented control; this one only governs what language the
 * tutor / step-mentor / hint generator outputs.
 *
 * We deliberately do NOT touch any cookie here so the UI language
 * stays independent. Requires an authenticated session.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const locale = (body as { locale?: unknown })?.locale;
  if (!isLocale(locale)) {
    return NextResponse.json(
      { error: "Unsupported locale" },
      { status: 400 }
    );
  }

  await prisma.user
    .update({
      where: { id: session.user.id },
      data: { feedbackLocale: locale }
    })
    .catch(() => {
      // Swallow — if the user row is gone the next session build will
      // drop them to login anyway.
    });

  return NextResponse.json({ ok: true, locale });
}
