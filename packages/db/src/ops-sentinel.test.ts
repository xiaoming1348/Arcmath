import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  ARCMATH_OPS_SENTINEL_NAME,
  ARCMATH_OPS_SENTINEL_SLUG,
  ensureArcmathOpsSentinel
} from "./ops-sentinel";

type FakeAdmin = {
  id: string;
  existingStatus?: "ACTIVE" | "DISABLED";
  existingMembershipId?: string;
};

function makeFakePrisma(opts: { admins: FakeAdmin[]; sentinelExists?: boolean }) {
  const upsertCalls: unknown[] = [];
  const createCalls: unknown[] = [];
  const updateCalls: unknown[] = [];

  const prisma = {
    organization: {
      upsert: vi.fn(async (args: unknown) => {
        upsertCalls.push(args);
        return { id: "org_sentinel" };
      })
    },
    user: {
      findMany: vi.fn(async () => {
        return opts.admins.map((admin) => ({
          id: admin.id,
          organizationMemberships:
            admin.existingStatus !== undefined
              ? [
                  {
                    id: admin.existingMembershipId ?? `mem_${admin.id}`,
                    status: admin.existingStatus
                  }
                ]
              : []
        }));
      })
    },
    organizationMembership: {
      create: vi.fn(async (args: unknown) => {
        createCalls.push(args);
        return { id: "mem_new" };
      }),
      update: vi.fn(async (args: unknown) => {
        updateCalls.push(args);
        return { id: "mem_updated" };
      })
    }
  } as unknown as PrismaClient;

  return { prisma, upsertCalls, createCalls, updateCalls };
}

describe("ensureArcmathOpsSentinel", () => {
  it("upserts the sentinel org with stable slug + display name", async () => {
    const { prisma, upsertCalls } = makeFakePrisma({ admins: [] });
    const result = await ensureArcmathOpsSentinel(prisma);

    expect(upsertCalls).toHaveLength(1);
    const upsertArgs = upsertCalls[0] as {
      where: { slug: string };
      create: { slug: string; name: string; planType: string; maxStudentSeats: number };
      update: { name: string };
    };
    expect(upsertArgs.where.slug).toBe(ARCMATH_OPS_SENTINEL_SLUG);
    expect(upsertArgs.create.slug).toBe(ARCMATH_OPS_SENTINEL_SLUG);
    expect(upsertArgs.create.name).toBe(ARCMATH_OPS_SENTINEL_NAME);
    // Internal sentinel — no student seats.
    expect(upsertArgs.create.maxStudentSeats).toBe(0);
    // Non-trial: this row never expires.
    expect(upsertArgs.create.planType).toBe("PAID");
    expect(upsertArgs.update.name).toBe(ARCMATH_OPS_SENTINEL_NAME);
    expect(result.organizationId).toBe("org_sentinel");
    expect(result.totalActiveAdmins).toBe(0);
  });

  it("creates missing OWNER memberships for admins with no row yet", async () => {
    const { prisma, createCalls, updateCalls } = makeFakePrisma({
      admins: [{ id: "admin_a" }, { id: "admin_b" }]
    });
    const result = await ensureArcmathOpsSentinel(prisma);

    expect(createCalls).toHaveLength(2);
    expect(updateCalls).toHaveLength(0);
    for (const call of createCalls) {
      const data = (call as { data: { role: string; status: string; organizationId: string } }).data;
      expect(data.role).toBe("OWNER");
      expect(data.status).toBe("ACTIVE");
      expect(data.organizationId).toBe("org_sentinel");
    }
    expect(result.addedAdminMemberships).toBe(2);
    expect(result.reactivatedAdminMemberships).toBe(0);
    expect(result.totalActiveAdmins).toBe(2);
  });

  it("reactivates admins whose sentinel membership was DISABLED", async () => {
    const { prisma, createCalls, updateCalls } = makeFakePrisma({
      admins: [{ id: "admin_a", existingStatus: "DISABLED", existingMembershipId: "mem_a" }]
    });
    const result = await ensureArcmathOpsSentinel(prisma);

    expect(createCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(1);
    const updateArgs = updateCalls[0] as {
      where: { id: string };
      data: { role: string; status: string };
    };
    expect(updateArgs.where.id).toBe("mem_a");
    expect(updateArgs.data.status).toBe("ACTIVE");
    expect(updateArgs.data.role).toBe("OWNER");
    expect(result.reactivatedAdminMemberships).toBe(1);
    expect(result.addedAdminMemberships).toBe(0);
  });

  it("does nothing extra when an admin already has an ACTIVE sentinel membership", async () => {
    const { prisma, createCalls, updateCalls } = makeFakePrisma({
      admins: [{ id: "admin_a", existingStatus: "ACTIVE" }]
    });
    const result = await ensureArcmathOpsSentinel(prisma);

    expect(createCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
    expect(result.addedAdminMemberships).toBe(0);
    expect(result.reactivatedAdminMemberships).toBe(0);
    expect(result.totalActiveAdmins).toBe(1);
  });

  it("is safe to re-run on a mix of new + existing admins", async () => {
    const { prisma, createCalls, updateCalls } = makeFakePrisma({
      admins: [
        { id: "admin_a", existingStatus: "ACTIVE" },
        { id: "admin_b" },
        { id: "admin_c", existingStatus: "DISABLED", existingMembershipId: "mem_c" }
      ]
    });
    const result = await ensureArcmathOpsSentinel(prisma);

    expect(createCalls).toHaveLength(1); // admin_b
    expect(updateCalls).toHaveLength(1); // admin_c reactivated
    expect(result.addedAdminMemberships).toBe(1);
    expect(result.reactivatedAdminMemberships).toBe(1);
    expect(result.totalActiveAdmins).toBe(3);
  });
});
