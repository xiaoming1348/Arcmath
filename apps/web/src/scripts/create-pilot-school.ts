/**
 * Provision a new pilot-school tenant — Organization + initial
 * school-admin User + OrganizationMembership — in one atomic transaction.
 *
 * Expected invocation (see PILOT_ONBOARDING.md §1):
 *
 *   bash scripts/with-env-local.sh \
 *     pnpm -C apps/web exec tsx src/scripts/create-pilot-school.ts \
 *       --name "Example International School" \
 *       --slug "example-intl" \
 *       --locale en \
 *       --admin-email "admin@example.edu" \
 *       --admin-name "First Last"
 *
 * Optional flags:
 *   --trial-days <n>           Default 90.
 *   --max-teacher-seats <n>    Default 3 (pilot cap; bumps require founder sign-off).
 *   --max-student-seats <n>    Default 50 (ditto).
 *   --dry-run                  Validate + print the plan, skip DB writes.
 *
 * Safety posture:
 *   • Idempotency guard — if the slug *or* the admin email already exists,
 *     the script refuses and exits non-zero so the operator can dedupe.
 *   • Writes run inside a single `$transaction`; a failure on any step
 *     rolls back the whole tenant (no half-provisioned rows to clean up).
 *   • A strong temp password is generated and printed ONCE. Share it with
 *     the school admin via a secure out-of-band channel (1Password,
 *     Signal, in-person); never the same email thread as the login URL.
 *     Known gap until Phase 7: we don't have a self-service
 *     change-password UI, so operators currently rotate the hash via
 *     Prisma Studio after the admin's first login.
 *
 * The CLI is a thin wrapper around `runCreatePilotSchool`, which is pure
 * enough to unit-test — see `create-pilot-school.test.ts`.
 */

import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { prisma as defaultPrisma } from "@arcmath/db";
import type { PrismaClient } from "@arcmath/db";
import { withPepper } from "../lib/password";
import { logAudit } from "../lib/audit";

// --- types & constants ------------------------------------------------------

export const DEFAULT_TRIAL_DAYS = 90;
export const DEFAULT_MAX_TEACHER_SEATS = 3;
export const DEFAULT_MAX_STUDENT_SEATS = 50;

// Slug: 3..60 chars; starts + ends with alphanumeric; inner chars may
// include dashes. No consecutive dashes (keeps URLs tidy).
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?!-)){1,58}[a-z0-9]$/;

export type PilotLocale = "en" | "zh";

export type CreatePilotSchoolArgs = {
  name: string;
  slug: string;
  locale: PilotLocale;
  adminEmail: string;
  adminName: string;
  trialDays: number;
  maxTeacherSeats: number;
  maxStudentSeats: number;
  dryRun: boolean;
};

export type CreatePilotSchoolResult = {
  organizationId: string;
  userId: string;
  membershipId: string;
  tempPassword: string;
  trialStartedAt: Date;
  trialEndsAt: Date;
  dryRun: boolean;
};

// --- arg parsing ------------------------------------------------------------

/**
 * Deterministic CLI-arg parser. Accepts `--flag value` pairs plus a
 * single boolean switch (`--dry-run`). Throws human-readable errors on
 * invalid input — those bubble up to `main()` where they become a
 * non-zero exit with a help block.
 */
export function parseArgs(argv: string[]): CreatePilotSchoolArgs {
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
  const optionalInt = (key: string, fallback: number): number => {
    const v = flags.get(key);
    if (v === undefined) return fallback;
    if (typeof v !== "string") throw new Error(`--${key} requires a value`);
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n) || String(n) !== v || n <= 0) {
      throw new Error(`--${key} must be a positive integer (got "${v}")`);
    }
    return n;
  };

  const name = required("name").trim();
  if (name.length === 0 || name.length > 200) {
    throw new Error("--name must be 1..200 characters");
  }

  const slug = required("slug").trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      '--slug must be 3..60 chars, lowercase letters/digits/dashes (no leading/trailing/consecutive dashes)'
    );
  }

  const localeRaw = required("locale").trim().toLowerCase();
  if (localeRaw !== "en" && localeRaw !== "zh") {
    throw new Error('--locale must be "en" or "zh"');
  }
  const locale: PilotLocale = localeRaw;

  const adminEmail = required("admin-email").trim().toLowerCase();
  // Pragmatic check — full RFC-5322 parsing isn't worth it for an ops
  // script where the operator retypes typos from their own notes.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    throw new Error('--admin-email must look like "name@example.com"');
  }

  const adminName = required("admin-name").trim();
  if (adminName.length === 0 || adminName.length > 120) {
    throw new Error("--admin-name must be 1..120 characters");
  }

  const trialDays = optionalInt("trial-days", DEFAULT_TRIAL_DAYS);
  if (trialDays > 365) {
    throw new Error("--trial-days must be ≤ 365 (longer than 1 year needs a real contract)");
  }

  const maxTeacherSeats = optionalInt("max-teacher-seats", DEFAULT_MAX_TEACHER_SEATS);
  const maxStudentSeats = optionalInt("max-student-seats", DEFAULT_MAX_STUDENT_SEATS);

  return {
    name,
    slug,
    locale,
    adminEmail,
    adminName,
    trialDays,
    maxTeacherSeats,
    maxStudentSeats,
    dryRun: flags.get("dry-run") === true
  };
}

// --- password generation ----------------------------------------------------

/**
 * 12 bytes of crypto-random → 16 base64url chars → ~96 bits of entropy.
 * That's more than enough for a one-time OOB password, and short enough
 * that the operator can read it to the school admin over voice without
 * dictation pain.
 */
export function generateTempPassword(
  randomFn: (size: number) => Buffer = randomBytes
): string {
  return randomFn(12).toString("base64url");
}

// --- main workflow ----------------------------------------------------------

export type CreatePilotSchoolDeps = {
  prisma: PrismaClient;
  /** Injected for deterministic tests. Defaults to `new Date()`. */
  now?: Date;
  /** Injected for deterministic tests. Defaults to crypto-random base64url. */
  generateTempPassword?: () => string;
  /** Injected for fast tests. Defaults to `bcrypt.hash(withPepper(plain), 10)`. */
  hashPassword?: (plain: string) => Promise<string>;
};

/**
 * Provision the tenant. Exported for testing + for future /admin UI
 * reuse (so the script and the UI route share one implementation).
 */
export async function runCreatePilotSchool(
  args: CreatePilotSchoolArgs,
  deps: CreatePilotSchoolDeps
): Promise<CreatePilotSchoolResult> {
  const now = deps.now ?? new Date();
  const tempPassword = (deps.generateTempPassword ?? generateTempPassword)();
  const hashFn = deps.hashPassword ?? ((plain) => bcrypt.hash(withPepper(plain), 10));

  // Pre-flight: refuse on slug OR email collision. Running the side
  // effects (create Org + User + Membership) under these conditions
  // would either blow up the transaction on a unique-index violation
  // (leaving a confusing error for the operator) or, worse, create
  // split state if we ever split the writes out of the transaction.
  const [existingOrg, existingUser] = await Promise.all([
    deps.prisma.organization.findUnique({
      where: { slug: args.slug },
      select: { id: true, name: true }
    }),
    deps.prisma.user.findUnique({
      where: { email: args.adminEmail },
      select: { id: true, email: true }
    })
  ]);

  if (existingOrg) {
    throw new Error(
      `Organization with slug "${args.slug}" already exists ` +
        `(id=${existingOrg.id}, name="${existingOrg.name}"). ` +
        `Pick a different slug or reuse the existing tenant.`
    );
  }
  if (existingUser) {
    throw new Error(
      `User with email "${args.adminEmail}" already exists (id=${existingUser.id}). ` +
        `Invite them into the new tenant via /admin instead of running this script.`
    );
  }

  const trialStartedAt = now;
  const trialEndsAt = new Date(now.getTime() + args.trialDays * 24 * 60 * 60 * 1000);

  if (args.dryRun) {
    return {
      organizationId: "dry-run",
      userId: "dry-run",
      membershipId: "dry-run",
      tempPassword,
      trialStartedAt,
      trialEndsAt,
      dryRun: true
    };
  }

  const passwordHash = await hashFn(tempPassword);

  const result = await deps.prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: args.name,
        slug: args.slug,
        // Enum `OrganizationPlanType` is TRIAL | PAID. The onboarding
        // doc's informal "SCHOOL" plan name maps to TRIAL for a pilot
        // tenant; it flips to PAID at end-of-pilot conversion.
        planType: "TRIAL",
        trialStartedAt,
        trialEndsAt,
        maxTeacherSeats: args.maxTeacherSeats,
        maxStudentSeats: args.maxStudentSeats,
        defaultLocale: args.locale
      },
      select: { id: true }
    });

    const user = await tx.user.create({
      data: {
        email: args.adminEmail,
        name: args.adminName,
        role: "TEACHER",
        locale: args.locale,
        passwordHash
      },
      select: { id: true }
    });

    const membership = await tx.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE"
      },
      select: { id: true }
    });

    // Audit event: script-authored, so actorUserId is null — we attribute
    // by payload.script instead. The ops SOP (see PILOT_SUPPORT_PLAYBOOK
    // §8) expects every mutation to leave a row in AuditLogEvent, and
    // that includes bootstrap flows like this one.
    await logAudit(
      tx,
      { userId: null, organizationId: organization.id },
      {
        action: "admin.organization.create_pilot_school",
        targetType: "Organization",
        targetId: organization.id,
        payload: {
          name: args.name,
          slug: args.slug,
          locale: args.locale,
          adminEmail: args.adminEmail,
          adminName: args.adminName,
          maxTeacherSeats: args.maxTeacherSeats,
          maxStudentSeats: args.maxStudentSeats,
          trialStartedAt: trialStartedAt.toISOString(),
          trialEndsAt: trialEndsAt.toISOString(),
          script: "create-pilot-school.ts"
        }
      }
    );

    return {
      organizationId: organization.id,
      userId: user.id,
      membershipId: membership.id
    };
  });

  return {
    ...result,
    tempPassword,
    trialStartedAt,
    trialEndsAt,
    dryRun: false
  };
}

// --- CLI entry point --------------------------------------------------------

function printUsage(stream: NodeJS.WritableStream = process.stderr): void {
  stream.write(
    [
      "Usage:",
      "  bash scripts/with-env-local.sh \\",
      "    pnpm -C apps/web exec tsx src/scripts/create-pilot-school.ts \\",
      '      --name "Example International School" \\',
      '      --slug "example-intl" \\',
      "      --locale en \\",
      '      --admin-email "admin@example.edu" \\',
      '      --admin-name "First Last"',
      "",
      "Optional:",
      `  --trial-days <n>          (default ${DEFAULT_TRIAL_DAYS})`,
      `  --max-teacher-seats <n>   (default ${DEFAULT_MAX_TEACHER_SEATS})`,
      `  --max-student-seats <n>   (default ${DEFAULT_MAX_STUDENT_SEATS})`,
      "  --dry-run                 Validate + preview, no DB writes",
      ""
    ].join("\n")
  );
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  let args: CreatePilotSchoolArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[create-pilot-school] ${msg}\n\n`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  try {
    const result = await runCreatePilotSchool(args, { prisma: defaultPrisma });
    const prefix = result.dryRun ? "[dry-run] " : "";
    const out = process.stdout;

    out.write("\n");
    out.write(`${prefix}Pilot school provisioned.\n`);
    out.write(`    Organization  ${args.name}  (${args.slug})\n`);
    out.write(`    Locale        ${args.locale}\n`);
    out.write(
      `    Seats         ${args.maxTeacherSeats} teacher, ${args.maxStudentSeats} student\n`
    );
    out.write(
      `    Trial window  ${result.trialStartedAt.toISOString()} → ${result.trialEndsAt.toISOString()} (${args.trialDays} days)\n`
    );
    out.write(`    Admin         ${args.adminName} <${args.adminEmail}>\n`);
    if (!result.dryRun) {
      out.write(`    Org ID        ${result.organizationId}\n`);
      out.write(`    User ID       ${result.userId}\n`);
      out.write(`    Membership    ${result.membershipId}\n`);
    } else {
      out.write("    (no DB writes committed — dry-run mode)\n");
    }
    out.write("\n");
    out.write("Temporary password (share OUT-OF-BAND only):\n");
    out.write(`    ${result.tempPassword}\n`);
    out.write("\n");
    out.write(
      `Hand this to ${args.adminEmail} via 1Password / Signal / in person — never\n`
    );
    out.write(
      "in the same email thread as the login URL. After the admin logs in for\n"
    );
    out.write(
      "the first time, rotate the hash from Prisma Studio (change-password UI is\n"
    );
    out.write("a known Phase-7 gap) and write a matching audit row.\n");
    out.write("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[create-pilot-school] failed: ${msg}\n`);
    process.exitCode = 1;
  } finally {
    // Disconnect defensively — if the caller passed their own prisma
    // instance via runCreatePilotSchool they won't have connected ours,
    // and $disconnect on an uninitialised client is a no-op.
    await defaultPrisma.$disconnect().catch(() => undefined);
  }
}

// Only auto-invoke when executed directly via `tsx` / `node --import tsx`
// — importing this module from tests (or a future /admin route) must NOT
// trigger an accidental DB write.
const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === currentPath) {
  void main();
}
