/**
 * Parent invite — token generation, persistence, email send.
 *
 * Mirrors lib/email/verification.ts in style, but for the
 * teacher-initiated parent invite flow:
 *
 *   - Token is 32 random bytes (256 bits), hex-encoded. Stored verbatim
 *     in `ParentInvite.token`; treated as a credential in the URL.
 *   - Default TTL is 30 days. Long because parents may not check email
 *     promptly, and the data they get is read-only.
 *   - "Consume" semantics are softer than verification: opening the link
 *     within expiresAt always works. We just record `consumedAt` on the
 *     first view for telemetry / "did this invite actually land".
 */

import { randomBytes } from "crypto";
import type { PrismaClient } from "@arcmath/db";
import { renderParentInviteEmail } from "./email/templates";
import { sendEmail } from "./email/resend-client";

const TOKEN_BYTES = 32;
const INVITE_TTL_DAYS = 30;

export function generateParentInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

function buildParentViewUrl(token: string): string {
  const base =
    process.env.NEXTAUTH_URL ??
    process.env.APP_URL ??
    "http://localhost:3000";
  const cleanBase = base.replace(/\/$/, "");
  return `${cleanBase}/parent/${encodeURIComponent(token)}`;
}

export type CreateInviteInput = {
  prisma: PrismaClient;
  studentUserId: string;
  parentEmail: string;
  invitedByUserId: string;
  organizationId: string;
  relationship?: string | null;
};

export type CreateInviteResult =
  | { ok: true; inviteId: string; token: string; expiresAt: Date }
  | { ok: false; error: string };

export async function createParentInvite(
  input: CreateInviteInput
): Promise<CreateInviteResult> {
  const token = generateParentInviteToken();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  try {
    const row = await input.prisma.parentInvite.create({
      data: {
        token,
        studentUserId: input.studentUserId,
        parentEmail: input.parentEmail.trim().toLowerCase(),
        invitedByUserId: input.invitedByUserId,
        organizationId: input.organizationId,
        relationship: input.relationship?.trim() || null,
        expiresAt
      },
      select: { id: true }
    });
    return { ok: true, inviteId: row.id, token, expiresAt };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create invite"
    };
  }
}

export type SendInviteEmailInput = {
  parentEmail: string;
  studentName: string | null;
  organizationName: string;
  token: string;
  expiresAt: Date;
  relationship?: string | null;
};

export async function sendParentInviteEmail(
  input: SendInviteEmailInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewUrl = buildParentViewUrl(input.token);

  // Dev-only banner — match verification.ts behaviour so devs without
  // RESEND_API_KEY can still copy the link out of console.
  const apiKeyConfigured =
    !!process.env.RESEND_API_KEY && process.env.EMAIL_LOG_ONLY !== "1";
  if (!apiKeyConfigured) {
    // eslint-disable-next-line no-console
    console.log(
      `\n========= ARCMATH DEV: copy this parent-invite link =========\n${viewUrl}\n=============================================================\n`
    );
  }

  const { subject, html, text } = renderParentInviteEmail(null, {
    studentName: input.studentName,
    relationship: input.relationship ?? null,
    organizationName: input.organizationName,
    viewUrl,
    expiresAt: input.expiresAt
  });

  const result = await sendEmail({
    to: input.parentEmail,
    subject,
    html,
    text,
    idempotencyKey: `parent-invite-${input.token.slice(0, 16)}`
  });

  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error(
      `[parent-invite] sendParentInviteEmail failed for ${input.parentEmail}:`,
      result.error
    );
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

// Loose email validation — good enough to catch typos like missing @.
// Real validation is "did Resend accept it" (we surface the resend
// error if it didn't).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPlausibleEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}
