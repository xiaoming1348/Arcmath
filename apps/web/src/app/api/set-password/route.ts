import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@arcmath/db";
import { withPepper } from "@/lib/password";

/**
 * POST /api/set-password
 *
 * Body: { email: string, password: string }
 *
 * Sets the password for a roster-spawned account that doesn't have one
 * yet. Refuses to overwrite an existing password — those users must
 * sign in normally with their existing credential. The route never
 * leaks whether the email exists; both "no such user" and "already
 * has a password" return the same generic message.
 */

const requestSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200)
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
      { error: "Email and password (8+ characters) are required." },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true }
  });

  // Bail with the same message in both "user not found" and "user has
  // a password already" cases. We don't want this endpoint to be used
  // as an account-existence oracle.
  if (!user || user.passwordHash) {
    return NextResponse.json(
      {
        error:
          "Could not set password. Either the username doesn't match anyone in your school, or this account already has a password — try signing in with it instead."
      },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(withPepper(parsed.data.password), 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash }
  });

  return NextResponse.json({ ok: true });
}
