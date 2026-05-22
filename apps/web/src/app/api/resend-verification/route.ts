import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@arcmath/db";
import { sendVerificationEmail } from "@/lib/email/verification";

/**
 * POST /api/resend-verification
 *
 * Body: { email: string }
 *
 * Re-sends the email-verification link for an already-existing
 * account that hasn't completed verification yet. We always return
 * 200 with the same payload regardless of whether the email matches
 * a real user — we don't want this endpoint to be used as an
 * account-existence oracle.
 *
 * Rate-limit considered out of scope for pilot: nginx already enforces
 * 100 r/s per IP at the edge (see deploy/hk-vps/setup-nginx.sh), and
 * Resend caps deliveries on their end. We can add a per-email cooldown
 * to the EmailVerificationToken table later if we see abuse.
 */
const requestSchema = z.object({
  email: z.string().email().max(200)
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid email is required." },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      locale: true,
      emailVerifiedAt: true,
      passwordHash: true
    }
  });

  // Quietly skip three cases:
  //   1. No such user — don't leak account existence
  //   2. Already verified — nothing to send
  //   3. Admin-spawned account without a password — those don't
  //      use email verification, they use /login/set-password
  // All three return the same generic success.
  if (!user || user.emailVerifiedAt || !user.passwordHash) {
    return NextResponse.json(
      { ok: true, message: "If an account exists, a verification email has been sent." }
    );
  }

  const result = await sendVerificationEmail(prisma, user);
  if (!result.ok) {
    console.error(
      `[resend-verification] send failed for ${user.email}:`,
      result.error
    );
    // Still return 200 to the user — they can try again in a minute.
    return NextResponse.json({
      ok: true,
      message: "If an account exists, a verification email has been sent."
    });
  }

  return NextResponse.json({
    ok: true,
    message: "Verification email sent."
  });
}
