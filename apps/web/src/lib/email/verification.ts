/**
 * High-level email-verification helpers.
 *
 * - generateVerificationToken: random 32-byte hex, suitable for a URL
 *   path/query parameter. We store this verbatim — there's no DB-side
 *   hashing because the token itself is high-entropy (256 bits) and
 *   single-use; the threat model is "attacker steals a DB row", which
 *   if it happens, our DB has bigger problems.
 *
 * - issueVerificationToken: clean up the user's old un-consumed tokens,
 *   insert a new one with 24h expiry, return the row.
 *
 * - sendVerificationEmail: call issueVerificationToken + sendEmail.
 *   Returns { ok, error? } so callers can decide how to react.
 *
 * - consumeVerificationToken: validate a token presented by a user
 *   clicking the email link, mark the user verified, mark token used.
 */

import { randomBytes } from "crypto";
import type { PrismaClient } from "@arcmath/db";
import { renderVerifyEmail } from "./templates";
import { sendEmail } from "./resend-client";

const TOKEN_BYTES = 32; // 256-bit token, hex-encoded
const VERIFY_TOKEN_TTL_HOURS = 24;
const PURPOSE_VERIFY = "EMAIL_VERIFICATION";

export function generateVerificationToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

function buildVerifyUrl(token: string): string {
  const base =
    process.env.NEXTAUTH_URL ??
    process.env.APP_URL ??
    "http://localhost:3000";
  // Strip trailing slash so we don't end up with a double slash
  const cleanBase = base.replace(/\/$/, "");
  return `${cleanBase}/verify-email?token=${encodeURIComponent(token)}`;
}

export type IssueResult = {
  token: string;
  expiresAt: Date;
};

export async function issueVerificationToken(
  prisma: PrismaClient,
  userId: string
): Promise<IssueResult> {
  // Invalidate any un-consumed prior tokens for this user. We mark them
  // consumed with timestamp=now to keep a paper trail; no need to delete.
  await prisma.emailVerificationToken.updateMany({
    where: {
      userId,
      purpose: PURPOSE_VERIFY,
      consumedAt: null
    },
    data: { consumedAt: new Date() }
  });

  const token = generateVerificationToken();
  const expiresAt = new Date(
    Date.now() + VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000
  );

  await prisma.emailVerificationToken.create({
    data: {
      token,
      userId,
      purpose: PURPOSE_VERIFY,
      expiresAt
    }
  });

  return { token, expiresAt };
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendVerificationEmail(
  prisma: PrismaClient,
  user: { id: string; email: string; name: string | null; locale: string | null }
): Promise<SendResult> {
  const { token } = await issueVerificationToken(prisma, user.id);
  const verifyUrl = buildVerifyUrl(token);

  const { subject, html, text } = renderVerifyEmail(
    user.locale as "en" | "zh" | null,
    {
      recipientName: user.name,
      verifyUrl,
      expiryHours: VERIFY_TOKEN_TTL_HOURS
    }
  );

  // Dev-only convenience: when we're falling back to log-only (no
  // RESEND_API_KEY in this env), print the verify URL on its OWN
  // line, not embedded in the multi-line text body. node's util.inspect
  // formats multi-line strings as 'line\n' + 'line\n' + ... which
  // makes the URL hard to copy without dragging a stray \n into the
  // address bar. This banner avoids that.
  const apiKeyConfigured =
    !!process.env.RESEND_API_KEY && process.env.EMAIL_LOG_ONLY !== "1";
  if (!apiKeyConfigured) {
    // eslint-disable-next-line no-console
    console.log(
      `\n========= ARCMATH DEV: copy this verify link =========\n${verifyUrl}\n======================================================\n`
    );
  }

  const result = await sendEmail({
    to: user.email,
    subject,
    html,
    text,
    // Idempotency key: per-token so a retry of the same token is deduped
    // but resending creates a new token and so a new key.
    idempotencyKey: `verify-${token.slice(0, 16)}`
  });

  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error(
      `[email] sendVerificationEmail failed for user ${user.id}:`,
      result.error
    );
    return { ok: false, error: result.error };
  }

  return { ok: true };
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "ALREADY_USED" };

export async function consumeVerificationToken(
  prisma: PrismaClient,
  token: string
): Promise<ConsumeResult> {
  const row = await prisma.emailVerificationToken.findUnique({
    where: { token }
  });

  if (!row || row.purpose !== PURPOSE_VERIFY) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  if (row.consumedAt) {
    return { ok: false, reason: "ALREADY_USED" };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }

  // Use a transaction so the user-update and token-consume can't drift.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() }
    }),
    prisma.emailVerificationToken.update({
      where: { id: row.id },
      data: { consumedAt: new Date() }
    })
  ]);

  return { ok: true, userId: row.userId };
}
