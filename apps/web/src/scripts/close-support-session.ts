/**
 * Close a platform-admin "I need to act as a teacher" support session —
 * flip the temporary tenant membership back to DISABLED and record the
 * mandatory audit row.
 *
 * Full workflow (see PILOT_SUPPORT_PLAYBOOK.md §8):
 *
 *   1. In Prisma Studio, add an `OrganizationMembership` for yourself in
 *      the target school with `role=TEACHER`, `status=ACTIVE`.
 *   2. Log out / back in, do your diagnostic work, log out.
 *   3. Run this script to flip the temp membership DISABLED and leave
 *      an `admin.support_session.close` audit event.
 *
 * Expected invocation:
 *
 *   bash scripts/with-env-local.sh \
 *     pnpm -C apps/web exec tsx src/scripts/close-support-session.ts \
 *       --actor-email "support@arcmath.local" \
 *       --tenant-slug "example-intl" \
 *       --reason "re-shared class join code after teacher rotated it"
 *
 * Flags:
 *   --actor-email <e>    Required. The ADMIN user whose support session
 *                        is being closed. Must have `role=ADMIN`.
 *   --tenant-slug <s>    Required. Slug of the school org whose temp
 *                        membership you're disabling. Refuses to operate
 *                        on the ArcMath Ops sentinel itself.
 *   --reason <text>      Required. 10..400 chars. Shows up verbatim in
 *                        the audit log; write something a future
 *                        on-caller can understand ("regenerated join
 *                        code for teacher X after leak", not "ok").
 *   --dry-run            Optional. Validate + preview; no writes.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  prisma as defaultPrisma,
  ARCMATH_OPS_SENTINEL_NAME,
  ARCMATH_OPS_SENTINEL_SLUG
} from "@arcmath/db";
import type { PrismaClient } from "@arcmath/db";
import { logAudit } from "../lib/audit";

// --- types ------------------------------------------------------------------

export type CloseSupportSessionArgs = {
  actorEmail: string;
  tenantSlug: string;
  reason: string;
  dryRun: boolean;
};

export type CloseSupportSessionResult = {
  actorUserId: string;
  organizationId: string;
  membershipId: string;
  previousStatus: "ACTIVE" | "DISABLED" | "DISABLED";
  dryRun: boolean;
};

// --- arg parsing ------------------------------------------------------------

export function parseArgs(argv: string[]): CloseSupportSessionArgs {
  const flags = new Map<string, string | true>();

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: "${token}"`);
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (key === "dry-run") {
      flags.set(key, true);
      continue;
    }
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`--${key} requires a value`);
    }
    flags.set(key, next);
    i += 1;
  }

  const required = (key: string): string => {
    const v = flags.get(key);
    if (typeof v !== "string" || v.length === 0) {
      throw new Error(`--${key} is required`);
    }
    return v;
  };

  const actorEmail = required("actor-email").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(actorEmail)) {
    throw new Error('--actor-email must look like "name@example.com"');
  }

  const tenantSlug = required("tenant-slug").trim().toLowerCase();
  if (tenantSlug.length === 0 || tenantSlug.length > 60) {
    throw new Error("--tenant-slug must be 1..60 characters");
  }
  if (tenantSlug === ARCMATH_OPS_SENTINEL_SLUG) {
    // The sentinel is the admin's *permanent* home tenant. Disabling
    // their membership here would be a footgun that locks them out of
    // the admin dashboard.
    throw new Error(
      `--tenant-slug must not be "${ARCMATH_OPS_SENTINEL_SLUG}" (the ${ARCMATH_OPS_SENTINEL_NAME} sentinel). ` +
        "This script only closes temporary memberships in real school tenants."
    );
  }

  const reason = required("reason").trim();
  if (reason.length < 10) {
    throw new Error("--reason must be at least 10 characters — describe what you did");
  }
  if (reason.length > 400) {
    throw new Error("--reason must be ≤ 400 characters");
  }

  return {
    actorEmail,
    tenantSlug,
    reason,
    dryRun: flags.get("dry-run") === true
  };
}

// --- main workflow ----------------------------------------------------------

export type CloseSupportSessionDeps = {
  prisma: PrismaClient;
};

/**
 * Flip the temp membership DISABLED + write the audit row. Exported so
 * tests can drive it with a fake Prisma.
 */
export async function runCloseSupportSession(
  args: CloseSupportSessionArgs,
  deps: CloseSupportSessionDeps
): Promise<CloseSupportSessionResult> {
  // 1. Resolve actor. Must be ADMIN — otherwise this would be a
  //    privilege-escalation trick (anyone could use the script to
  //    disable a teacher's own membership).
  const actor = await deps.prisma.user.findUnique({
    where: { email: args.actorEmail },
    select: { id: true, role: true }
  });
  if (!actor) {
    throw new Error(`No user with email "${args.actorEmail}" — can't close a session that never existed`);
  }
  if (actor.role !== "ADMIN") {
    throw new Error(
      `User "${args.actorEmail}" has role=${actor.role}; this script is only for role=ADMIN support sessions`
    );
  }

  // 2. Resolve tenant.
  const tenant = await deps.prisma.organization.findUnique({
    where: { slug: args.tenantSlug },
    select: { id: true, slug: true, name: true }
  });
  if (!tenant) {
    throw new Error(`No organization with slug "${args.tenantSlug}"`);
  }

  // 3. Find the temp membership. There is exactly one row per
  //    (org, user) by the unique-index in schema.prisma.
  const membership = await deps.prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: tenant.id,
        userId: actor.id
      }
    },
    select: { id: true, status: true, role: true }
  });
  if (!membership) {
    throw new Error(
      `No membership for "${args.actorEmail}" in tenant "${args.tenantSlug}" — did you forget step 1 (create temp membership in Prisma Studio)?`
    );
  }
  if (membership.status !== "ACTIVE") {
    throw new Error(
      `Membership for "${args.actorEmail}" in "${args.tenantSlug}" is already ${membership.status}; nothing to close`
    );
  }

  if (args.dryRun) {
    return {
      actorUserId: actor.id,
      organizationId: tenant.id,
      membershipId: membership.id,
      previousStatus: membership.status,
      dryRun: true
    };
  }

  // 4. Flip status + audit. Runs inside a transaction so the audit row
  //    is never orphaned from the membership change.
  await deps.prisma.$transaction(async (tx) => {
    await tx.organizationMembership.update({
      where: { id: membership.id },
      data: { status: "DISABLED" }
    });
    await logAudit(
      tx,
      { userId: actor.id, organizationId: tenant.id },
      {
        action: "admin.support_session.close",
        targetType: "OrganizationMembership",
        targetId: membership.id,
        payload: {
          actorEmail: args.actorEmail,
          tenantSlug: args.tenantSlug,
          tenantName: tenant.name,
          previousStatus: membership.status,
          previousRole: membership.role,
          reason: args.reason,
          script: "close-support-session.ts"
        }
      }
    );
  });

  return {
    actorUserId: actor.id,
    organizationId: tenant.id,
    membershipId: membership.id,
    previousStatus: membership.status,
    dryRun: false
  };
}

// --- CLI entry point --------------------------------------------------------

function printUsage(stream: NodeJS.WritableStream = process.stderr): void {
  stream.write(
    [
      "Usage:",
      "  bash scripts/with-env-local.sh \\",
      "    pnpm -C apps/web exec tsx src/scripts/close-support-session.ts \\",
      '      --actor-email "support@arcmath.local" \\',
      '      --tenant-slug "example-intl" \\',
      '      --reason "re-shared class join code after teacher rotated it"',
      "",
      "Optional:",
      "  --dry-run          Validate + preview, no DB writes",
      ""
    ].join("\n")
  );
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  let args: CloseSupportSessionArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[close-support-session] ${msg}\n\n`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  try {
    const result = await runCloseSupportSession(args, { prisma: defaultPrisma });
    const prefix = result.dryRun ? "[dry-run] " : "";
    const out = process.stdout;
    out.write("\n");
    out.write(`${prefix}Support session closed.\n`);
    out.write(`    Actor         ${args.actorEmail}  (user ${result.actorUserId})\n`);
    out.write(`    Tenant        ${args.tenantSlug}  (org ${result.organizationId})\n`);
    out.write(`    Membership    ${result.membershipId}  ACTIVE → DISABLED\n`);
    out.write(`    Reason        ${args.reason}\n`);
    if (result.dryRun) {
      out.write("    (no DB writes committed — dry-run mode)\n");
    }
    out.write("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[close-support-session] failed: ${msg}\n`);
    process.exitCode = 1;
  } finally {
    await defaultPrisma.$disconnect().catch(() => undefined);
  }
}

const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === currentPath) {
  void main();
}
