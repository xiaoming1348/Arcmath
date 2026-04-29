import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@arcmath/db";
import { ARCMATH_OPS_SENTINEL_SLUG } from "@arcmath/db";
import { parseArgs, runCloseSupportSession } from "./close-support-session";

// -- arg parsing --------------------------------------------------------------

describe("close-support-session arg parsing", () => {
  const baseArgs = [
    "--actor-email",
    "Support@arcmath.local",
    "--tenant-slug",
    "example-intl",
    "--reason",
    "re-shared class join code after teacher rotated it"
  ];

  it("parses the canonical happy-path invocation + lower-cases email/slug", () => {
    const parsed = parseArgs(baseArgs);
    expect(parsed.actorEmail).toBe("support@arcmath.local");
    expect(parsed.tenantSlug).toBe("example-intl");
    expect(parsed.reason).toBe("re-shared class join code after teacher rotated it");
    expect(parsed.dryRun).toBe(false);
  });

  it("supports --dry-run", () => {
    expect(parseArgs([...baseArgs, "--dry-run"]).dryRun).toBe(true);
  });

  it("rejects a missing --reason", () => {
    expect(() =>
      parseArgs([
        "--actor-email",
        "a@b.co",
        "--tenant-slug",
        "foo"
      ])
    ).toThrow(/--reason is required/);
  });

  it("rejects a reason that's too terse to be useful later", () => {
    expect(() =>
      parseArgs([
        "--actor-email",
        "a@b.co",
        "--tenant-slug",
        "foo",
        "--reason",
        "ok"
      ])
    ).toThrow(/at least 10 characters/);
  });

  it("refuses to target the ArcMath Ops sentinel itself", () => {
    expect(() =>
      parseArgs([
        "--actor-email",
        "a@b.co",
        "--tenant-slug",
        ARCMATH_OPS_SENTINEL_SLUG,
        "--reason",
        "some reason that is long enough to satisfy the 10-char floor"
      ])
    ).toThrow(/sentinel/);
  });

  it("rejects a malformed email", () => {
    expect(() =>
      parseArgs([
        "--actor-email",
        "not-an-email",
        "--tenant-slug",
        "foo",
        "--reason",
        "reason content here"
      ])
    ).toThrow(/--actor-email/);
  });
});

// -- runCloseSupportSession ---------------------------------------------------

function makeFakePrisma(opts: {
  actor?: { id: string; role: "STUDENT" | "TEACHER" | "ADMIN" } | null;
  tenant?: { id: string; slug: string; name: string } | null;
  membership?: { id: string; status: "ACTIVE" | "DISABLED" | "DISABLED"; role: string } | null;
}) {
  const updateCalls: unknown[] = [];
  const auditCalls: unknown[] = [];

  const tx = {
    organizationMembership: {
      update: vi.fn(async (args: unknown) => {
        updateCalls.push(args);
        return { id: "membership_updated" };
      })
    },
    auditLogEvent: {
      create: vi.fn(async (args: unknown) => {
        auditCalls.push(args);
        return { id: "audit_created" };
      })
    }
  };

  const prisma = {
    user: {
      findUnique: vi.fn(async () => (opts.actor === undefined ? null : opts.actor))
    },
    organization: {
      findUnique: vi.fn(async () => (opts.tenant === undefined ? null : opts.tenant))
    },
    organizationMembership: {
      findUnique: vi.fn(async () => (opts.membership === undefined ? null : opts.membership))
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
  } as unknown as PrismaClient;

  return { prisma, updateCalls, auditCalls, tx };
}

const canonicalArgs = {
  actorEmail: "support@arcmath.local",
  tenantSlug: "example-intl",
  reason: "re-shared class join code after teacher rotated it",
  dryRun: false
};

describe("runCloseSupportSession", () => {
  it("flips an ACTIVE membership to DISABLED and writes the audit row atomically", async () => {
    const { prisma, updateCalls, auditCalls, tx } = makeFakePrisma({
      actor: { id: "user_admin", role: "ADMIN" },
      tenant: { id: "org_tenant", slug: "example-intl", name: "Example International" },
      membership: { id: "mem_temp", status: "ACTIVE", role: "TEACHER" }
    });

    const result = await runCloseSupportSession(canonicalArgs, { prisma });

    expect(result.actorUserId).toBe("user_admin");
    expect(result.organizationId).toBe("org_tenant");
    expect(result.membershipId).toBe("mem_temp");
    expect(result.previousStatus).toBe("ACTIVE");
    expect(result.dryRun).toBe(false);

    expect(updateCalls).toHaveLength(1);
    const update = updateCalls[0] as { where: { id: string }; data: { status: string } };
    expect(update.where.id).toBe("mem_temp");
    expect(update.data.status).toBe("DISABLED");

    expect(auditCalls).toHaveLength(1);
    const audit = auditCalls[0] as {
      data: {
        action: string;
        actorUserId: string | null;
        organizationId: string;
        targetType: string;
        targetId: string;
        payload: Record<string, unknown>;
      };
    };
    expect(audit.data.action).toBe("admin.support_session.close");
    expect(audit.data.actorUserId).toBe("user_admin");
    expect(audit.data.organizationId).toBe("org_tenant");
    expect(audit.data.targetType).toBe("OrganizationMembership");
    expect(audit.data.targetId).toBe("mem_temp");
    expect(audit.data.payload).toMatchObject({
      actorEmail: "support@arcmath.local",
      tenantSlug: "example-intl",
      previousStatus: "ACTIVE",
      previousRole: "TEACHER",
      reason: "re-shared class join code after teacher rotated it",
      script: "close-support-session.ts"
    });

    expect(tx.organizationMembership.update).toHaveBeenCalledTimes(1);
    expect(tx.auditLogEvent.create).toHaveBeenCalledTimes(1);
  });

  it("dry-run returns the plan but writes nothing", async () => {
    const { prisma, updateCalls, auditCalls, tx } = makeFakePrisma({
      actor: { id: "user_admin", role: "ADMIN" },
      tenant: { id: "org_tenant", slug: "example-intl", name: "Example" },
      membership: { id: "mem_temp", status: "ACTIVE", role: "TEACHER" }
    });

    const result = await runCloseSupportSession(
      { ...canonicalArgs, dryRun: true },
      { prisma }
    );

    expect(result.dryRun).toBe(true);
    expect(result.previousStatus).toBe("ACTIVE");
    expect(updateCalls).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
    expect(tx.organizationMembership.update).not.toHaveBeenCalled();
  });

  it("refuses when actor doesn't exist", async () => {
    const { prisma } = makeFakePrisma({ actor: null });
    await expect(runCloseSupportSession(canonicalArgs, { prisma })).rejects.toThrow(
      /No user with email/
    );
  });

  it("refuses when actor isn't an ADMIN (privilege-escalation guard)", async () => {
    const { prisma } = makeFakePrisma({
      actor: { id: "user_teacher", role: "TEACHER" },
      tenant: { id: "org_t", slug: "example-intl", name: "Example" },
      membership: { id: "mem", status: "ACTIVE", role: "TEACHER" }
    });
    await expect(runCloseSupportSession(canonicalArgs, { prisma })).rejects.toThrow(
      /only for role=ADMIN support sessions/
    );
  });

  it("refuses when the tenant slug is unknown", async () => {
    const { prisma } = makeFakePrisma({
      actor: { id: "user_admin", role: "ADMIN" },
      tenant: null
    });
    await expect(runCloseSupportSession(canonicalArgs, { prisma })).rejects.toThrow(
      /No organization with slug/
    );
  });

  it("refuses when the admin has no membership in the tenant (step 1 skipped)", async () => {
    const { prisma } = makeFakePrisma({
      actor: { id: "user_admin", role: "ADMIN" },
      tenant: { id: "org_t", slug: "example-intl", name: "Example" },
      membership: null
    });
    await expect(runCloseSupportSession(canonicalArgs, { prisma })).rejects.toThrow(
      /No membership for .* did you forget step 1/
    );
  });

  it("refuses when the membership is already closed (idempotency guard)", async () => {
    const { prisma } = makeFakePrisma({
      actor: { id: "user_admin", role: "ADMIN" },
      tenant: { id: "org_t", slug: "example-intl", name: "Example" },
      membership: { id: "mem_old", status: "DISABLED", role: "TEACHER" }
    });
    await expect(runCloseSupportSession(canonicalArgs, { prisma })).rejects.toThrow(
      /already DISABLED/
    );
  });
});
