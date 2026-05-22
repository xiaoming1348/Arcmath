import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@arcmath/db";
import { withPepper } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/email/verification";

/**
 * Self-signup endpoint for school admins (B2 flow).
 *
 * Creates User + Organization + OrganizationMembership(OWNER) in one
 * shot. The user still has to verify their email before they can sign
 * in — see /api/register for the rationale; same flow re-used.
 *
 * Pilot defaults applied to the new org:
 *   - planType: TRIAL
 *   - 30-day trial window
 *   - 1 admin seat, 5 teacher seats, 50 student seats
 *   - default UI locale: en (admin can change in org settings)
 */
const requestSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120).optional(),
  organizationName: z.string().min(2).max(120)
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

async function ensureUniqueSlug(base: string): Promise<string> {
  const fallback = base.length > 0 ? base : "school";
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate =
      attempt === 0
        ? fallback
        : `${fallback}-${Math.random().toString(36).slice(2, 6)}`;
    const conflict = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true }
    });
    if (!conflict) return candidate;
  }
  // Final fallback — random suffix is unique enough that conflict is
  // astronomically unlikely.
  return `${fallback}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
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

    const slug = await ensureUniqueSlug(slugify(parsed.data.organizationName));
    const passwordHash = await bcrypt.hash(
      withPepper(parsed.data.password),
      10
    );

    // Create user + org + membership atomically. If any step fails the
    // whole transaction rolls back so we never end up with orphaned
    // rows. The admin gets the platform-level TEACHER role (so they
    // see teacher-side affordances), and the OWNER membership role
    // on the org.
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: parsed.data.name,
          passwordHash,
          role: "TEACHER"
          // emailVerifiedAt left null — user must verify
        },
        select: { id: true, email: true, name: true, role: true, locale: true }
      });

      const org = await tx.organization.create({
        data: {
          name: parsed.data.organizationName,
          slug,
          planType: "TRIAL",
          trialEndsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          maxAdminSeats: 1,
          maxTeacherSeats: 5,
          maxStudentSeats: 50,
          defaultLocale: "en"
        },
        select: { id: true, name: true, slug: true }
      });

      await tx.organizationMembership.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: "OWNER",
          status: "ACTIVE"
        }
      });

      return { user, org };
    });

    const sendResult = await sendVerificationEmail(prisma, result.user);
    if (!sendResult.ok) {
      console.error(
        `[register-school] verification email send failed for ${result.user.email}:`,
        sendResult.error
      );
    }

    return NextResponse.json(
      {
        user: { id: result.user.id, email: result.user.email },
        organization: result.org,
        verificationEmailSent: sendResult.ok,
        needsVerification: true
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("register-school failed", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
