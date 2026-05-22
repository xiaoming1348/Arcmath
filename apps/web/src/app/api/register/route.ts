import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@arcmath/db";
import { DEFAULT_ROLE, registerSchema } from "@arcmath/shared";
import { withPepper } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/email/verification";

/**
 * Self-signup endpoint for individual learners.
 *
 * Flow:
 *   1. Validate payload, ensure email is not already in use.
 *   2. Create the User row with passwordHash set and emailVerifiedAt
 *      LEFT NULL. Login is hard-blocked by NextAuth until the user
 *      clicks the link in the verification email (see lib/auth.ts).
 *   3. Issue a 24h verification token and email it to the user.
 *
 * If the email send fails (e.g. Resend down, invalid sender domain),
 * we still return 201 to the client — the account exists and the user
 * can request a resend from the /login error state. We just log the
 * failure server-side so ops can notice.
 *
 * Organization (school admin) signup uses a separate endpoint at
 * /api/register/school which builds an Organization + OWNER membership
 * alongside the user.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase().trim();
    const exists = await prisma.user.findUnique({ where: { email } });

    if (exists) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(withPepper(parsed.data.password), 10);

    const user = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name,
        passwordHash,
        role: DEFAULT_ROLE
        // emailVerifiedAt intentionally left null — user must verify
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locale: true
      }
    });

    // Fire-and-await the email so we can report failure to the dev
    // console, but the user-facing response is independent of email
    // delivery (the user could still verify later via the resend flow).
    const sendResult = await sendVerificationEmail(prisma, user);
    if (!sendResult.ok) {
      console.error(
        `[register] verification email send failed for ${user.email}:`,
        sendResult.error
      );
    }

    return NextResponse.json(
      {
        user: { id: user.id, email: user.email, role: user.role },
        verificationEmailSent: sendResult.ok,
        needsVerification: true
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("register failed", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
