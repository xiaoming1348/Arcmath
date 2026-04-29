import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@arcmath/db";
import {
  DEFAULT_MAX_STUDENT_SEATS,
  DEFAULT_MAX_TEACHER_SEATS,
  DEFAULT_TRIAL_DAYS,
  generateTempPassword,
  parseArgs,
  runCreatePilotSchool
} from "./create-pilot-school";

// -- argument parsing --------------------------------------------------------

describe("create-pilot-school arg parsing", () => {
  it("parses the canonical happy-path invocation with defaults applied", () => {
    const parsed = parseArgs([
      "--name",
      "Example International School",
      "--slug",
      "example-intl",
      "--locale",
      "en",
      "--admin-email",
      "Admin@Example.edu",
      "--admin-name",
      "First Last"
    ]);

    expect(parsed.name).toBe("Example International School");
    expect(parsed.slug).toBe("example-intl");
    expect(parsed.locale).toBe("en");
    // Emails are lower-cased for consistency with /api/register.
    expect(parsed.adminEmail).toBe("admin@example.edu");
    expect(parsed.adminName).toBe("First Last");
    expect(parsed.trialDays).toBe(DEFAULT_TRIAL_DAYS);
    expect(parsed.maxTeacherSeats).toBe(DEFAULT_MAX_TEACHER_SEATS);
    expect(parsed.maxStudentSeats).toBe(DEFAULT_MAX_STUDENT_SEATS);
    expect(parsed.dryRun).toBe(false);
  });

  it("accepts zh locale and honors overrides + dry-run switch", () => {
    const parsed = parseArgs([
      "--name",
      "上海某某中学",
      "--slug",
      "shanghai-x",
      "--locale",
      "ZH",
      "--admin-email",
      "admin@xmath.cn",
      "--admin-name",
      "张三",
      "--trial-days",
      "30",
      "--max-teacher-seats",
      "5",
      "--max-student-seats",
      "80",
      "--dry-run"
    ]);

    expect(parsed.locale).toBe("zh");
    expect(parsed.trialDays).toBe(30);
    expect(parsed.maxTeacherSeats).toBe(5);
    expect(parsed.maxStudentSeats).toBe(80);
    expect(parsed.dryRun).toBe(true);
  });

  it("rejects missing required flags with a helpful message", () => {
    expect(() =>
      parseArgs([
        "--slug",
        "foo-bar",
        "--locale",
        "en",
        "--admin-email",
        "a@b.co",
        "--admin-name",
        "A B"
      ])
    ).toThrow(/--name is required/);
  });

  it("rejects an invalid slug (leading dash) so URLs stay tidy", () => {
    expect(() =>
      parseArgs([
        "--name",
        "X",
        "--slug",
        "-bad",
        "--locale",
        "en",
        "--admin-email",
        "a@b.co",
        "--admin-name",
        "A"
      ])
    ).toThrow(/--slug must be 3\.\.60 chars/);
  });

  it("rejects consecutive-dash slugs (no `foo--bar`)", () => {
    expect(() =>
      parseArgs([
        "--name",
        "X",
        "--slug",
        "foo--bar",
        "--locale",
        "en",
        "--admin-email",
        "a@b.co",
        "--admin-name",
        "A"
      ])
    ).toThrow(/--slug/);
  });

  it("rejects an invalid locale", () => {
    expect(() =>
      parseArgs([
        "--name",
        "X",
        "--slug",
        "example-co",
        "--locale",
        "fr",
        "--admin-email",
        "a@b.co",
        "--admin-name",
        "A"
      ])
    ).toThrow(/--locale must be/);
  });

  it("rejects a malformed email", () => {
    expect(() =>
      parseArgs([
        "--name",
        "X",
        "--slug",
        "example-co",
        "--locale",
        "en",
        "--admin-email",
        "not-an-email",
        "--admin-name",
        "A"
      ])
    ).toThrow(/--admin-email/);
  });

  it("rejects a non-integer for trial-days", () => {
    expect(() =>
      parseArgs([
        "--name",
        "X",
        "--slug",
        "example-co",
        "--locale",
        "en",
        "--admin-email",
        "a@b.co",
        "--admin-name",
        "A",
        "--trial-days",
        "30.5"
      ])
    ).toThrow(/--trial-days must be a positive integer/);
  });

  it("rejects trial-days beyond the 1-year ceiling", () => {
    expect(() =>
      parseArgs([
        "--name",
        "X",
        "--slug",
        "example-co",
        "--locale",
        "en",
        "--admin-email",
        "a@b.co",
        "--admin-name",
        "A",
        "--trial-days",
        "500"
      ])
    ).toThrow(/--trial-days must be ≤ 365/);
  });
});

// -- password generation -----------------------------------------------------

describe("generateTempPassword", () => {
  it("returns deterministic output when given a deterministic random source", () => {
    const fakeRandom = (size: number) => Buffer.alloc(size, 0x41);
    const pw = generateTempPassword(fakeRandom);
    // 12 bytes of 0x41 → 'A'*12 → base64url "QUFBQUFBQUFBQUFB" (16 chars).
    expect(pw).toBe("QUFBQUFBQUFBQUFB");
    expect(pw).toHaveLength(16);
    expect(pw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces different passwords across calls by default", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a).not.toEqual(b);
    expect(a).toHaveLength(16);
  });
});

// -- runCreatePilotSchool — tenant provisioning ----------------------------

type TxRecording = {
  organizationCreate: unknown[];
  userCreate: unknown[];
  membershipCreate: unknown[];
  auditCreate: unknown[];
};

function makeFakePrisma(opts: {
  existingOrgSlug?: string;
  existingUserEmail?: string;
  recording?: TxRecording;
}) {
  const rec: TxRecording = opts.recording ?? {
    organizationCreate: [],
    userCreate: [],
    membershipCreate: [],
    auditCreate: []
  };

  const tx = {
    organization: {
      create: vi.fn(async (args: unknown) => {
        rec.organizationCreate.push(args);
        return { id: "org_fake" };
      })
    },
    user: {
      create: vi.fn(async (args: unknown) => {
        rec.userCreate.push(args);
        return { id: "user_fake" };
      })
    },
    organizationMembership: {
      create: vi.fn(async (args: unknown) => {
        rec.membershipCreate.push(args);
        return { id: "membership_fake" };
      })
    },
    auditLogEvent: {
      create: vi.fn(async (args: unknown) => {
        rec.auditCreate.push(args);
        return { id: "audit_fake" };
      })
    }
  };

  const prisma = {
    organization: {
      findUnique: vi.fn(async (args: { where: { slug: string } }) => {
        if (opts.existingOrgSlug && args.where.slug === opts.existingOrgSlug) {
          return { id: "org_existing", name: "Already Here" };
        }
        return null;
      })
    },
    user: {
      findUnique: vi.fn(async (args: { where: { email: string } }) => {
        if (opts.existingUserEmail && args.where.email === opts.existingUserEmail) {
          return { id: "user_existing", email: opts.existingUserEmail };
        }
        return null;
      })
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    $disconnect: vi.fn(async () => undefined)
  } as unknown as PrismaClient;

  return { prisma, rec, tx };
}

const happyArgs = {
  name: "Example International School",
  slug: "example-intl",
  locale: "en" as const,
  adminEmail: "admin@example.edu",
  adminName: "First Last",
  trialDays: 90,
  maxTeacherSeats: 3,
  maxStudentSeats: 50,
  dryRun: false
};

describe("runCreatePilotSchool", () => {
  it("writes Organization, User, Membership, and an audit row atomically", async () => {
    const { prisma, rec, tx } = makeFakePrisma({});
    const now = new Date("2026-04-22T00:00:00.000Z");

    const result = await runCreatePilotSchool(happyArgs, {
      prisma,
      now,
      generateTempPassword: () => "TestPass123AbC!",
      hashPassword: async (plain) => `hashed:${plain}`
    });

    expect(result.dryRun).toBe(false);
    expect(result.organizationId).toBe("org_fake");
    expect(result.userId).toBe("user_fake");
    expect(result.membershipId).toBe("membership_fake");
    expect(result.tempPassword).toBe("TestPass123AbC!");
    expect(result.trialStartedAt.toISOString()).toBe(now.toISOString());
    // 90 days out.
    expect(result.trialEndsAt.toISOString()).toBe("2026-07-21T00:00:00.000Z");

    expect(rec.organizationCreate).toHaveLength(1);
    const orgPayload = rec.organizationCreate[0] as {
      data: {
        name: string;
        slug: string;
        planType: string;
        maxTeacherSeats: number;
        maxStudentSeats: number;
        defaultLocale: string;
        trialEndsAt: Date;
      };
    };
    expect(orgPayload.data).toMatchObject({
      name: "Example International School",
      slug: "example-intl",
      planType: "TRIAL",
      maxTeacherSeats: 3,
      maxStudentSeats: 50,
      defaultLocale: "en"
    });
    expect(orgPayload.data.trialEndsAt.toISOString()).toBe("2026-07-21T00:00:00.000Z");

    expect(rec.userCreate).toHaveLength(1);
    const userPayload = rec.userCreate[0] as {
      data: { email: string; name: string; role: string; locale: string; passwordHash: string };
    };
    expect(userPayload.data).toEqual({
      email: "admin@example.edu",
      name: "First Last",
      role: "TEACHER",
      locale: "en",
      passwordHash: "hashed:TestPass123AbC!"
    });

    expect(rec.membershipCreate).toHaveLength(1);
    expect((rec.membershipCreate[0] as { data: unknown }).data).toEqual({
      organizationId: "org_fake",
      userId: "user_fake",
      role: "OWNER",
      status: "ACTIVE"
    });

    expect(rec.auditCreate).toHaveLength(1);
    const audit = rec.auditCreate[0] as {
      data: {
        action: string;
        targetType: string;
        targetId: string;
        organizationId: string;
        actorUserId: string | null;
        payload: unknown;
      };
    };
    expect(audit.data.action).toBe("admin.organization.create_pilot_school");
    expect(audit.data.targetType).toBe("Organization");
    expect(audit.data.targetId).toBe("org_fake");
    expect(audit.data.organizationId).toBe("org_fake");
    // Script-authored: no human actor.
    expect(audit.data.actorUserId).toBeNull();
    expect(audit.data.payload).toMatchObject({
      slug: "example-intl",
      adminEmail: "admin@example.edu",
      script: "create-pilot-school.ts"
    });

    // All 4 writes landed inside one transaction — key invariant for
    // "no half-provisioned tenants".
    expect(tx.organization.create).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.organizationMembership.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLogEvent.create).toHaveBeenCalledTimes(1);
  });

  it("dry-run skips all writes but still returns the planned temp password + trial window", async () => {
    const { prisma, rec, tx } = makeFakePrisma({});
    const now = new Date("2026-04-22T00:00:00.000Z");

    const result = await runCreatePilotSchool(
      { ...happyArgs, dryRun: true },
      {
        prisma,
        now,
        generateTempPassword: () => "DRY-RUN-PW",
        hashPassword: async () => {
          throw new Error("hashPassword must not be called in dry-run");
        }
      }
    );

    expect(result.dryRun).toBe(true);
    expect(result.organizationId).toBe("dry-run");
    expect(result.userId).toBe("dry-run");
    expect(result.membershipId).toBe("dry-run");
    expect(result.tempPassword).toBe("DRY-RUN-PW");
    expect(result.trialEndsAt.toISOString()).toBe("2026-07-21T00:00:00.000Z");

    expect(tx.organization.create).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.organizationMembership.create).not.toHaveBeenCalled();
    expect(tx.auditLogEvent.create).not.toHaveBeenCalled();
    expect(rec.organizationCreate).toHaveLength(0);
  });

  it("refuses when the slug already exists", async () => {
    const { prisma, tx } = makeFakePrisma({ existingOrgSlug: "example-intl" });

    await expect(
      runCreatePilotSchool(happyArgs, {
        prisma,
        now: new Date("2026-04-22T00:00:00.000Z"),
        generateTempPassword: () => "x",
        hashPassword: async () => "h"
      })
    ).rejects.toThrow(/slug "example-intl" already exists/);

    expect(tx.organization.create).not.toHaveBeenCalled();
  });

  it("refuses when the admin email already exists", async () => {
    const { prisma, tx } = makeFakePrisma({
      existingUserEmail: "admin@example.edu"
    });

    await expect(
      runCreatePilotSchool(happyArgs, {
        prisma,
        now: new Date("2026-04-22T00:00:00.000Z"),
        generateTempPassword: () => "x",
        hashPassword: async () => "h"
      })
    ).rejects.toThrow(/admin@example\.edu" already exists/);

    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("applies custom trial-days and seat limits to the Organization row", async () => {
    const { prisma, rec } = makeFakePrisma({});
    const now = new Date("2026-01-01T00:00:00.000Z");

    await runCreatePilotSchool(
      {
        ...happyArgs,
        slug: "custom-school",
        adminEmail: "owner@custom.edu",
        trialDays: 120,
        maxTeacherSeats: 10,
        maxStudentSeats: 200,
        locale: "zh"
      },
      {
        prisma,
        now,
        generateTempPassword: () => "pw",
        hashPassword: async () => "hashed"
      }
    );

    const orgData = (
      rec.organizationCreate[0] as {
        data: {
          maxTeacherSeats: number;
          maxStudentSeats: number;
          defaultLocale: string;
          trialEndsAt: Date;
        };
      }
    ).data;
    expect(orgData.maxTeacherSeats).toBe(10);
    expect(orgData.maxStudentSeats).toBe(200);
    expect(orgData.defaultLocale).toBe("zh");
    // 120 days after 2026-01-01 is 2026-05-01.
    expect(orgData.trialEndsAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});
