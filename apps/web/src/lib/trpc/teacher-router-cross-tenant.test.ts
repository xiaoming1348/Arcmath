/**
 * Cross-tenant isolation tests for the teacher.* router.
 *
 * Flagged in MULTI_TENANT_ISOLATION.md §5 item 1: "seed two orgs A and B,
 * call each procedure with an A-caller passing B-owned ids, assert the
 * response is NOT_FOUND (never 200 with leaked data)."
 *
 * For each tenant-scoped teacher procedure we assert:
 *   1. Calling with an id owned by org B raises a TRPCError.
 *   2. The rejection code matches the procedure's contract:
 *        - NOT_FOUND  — post-fetch org check (classes.get, classes.delete,
 *          assignments.progress, assignments.delete).
 *        - FORBIDDEN  — assertCanManageClass (classes.update,
 *          classes.inviteStudents, classes.removeStudent,
 *          assignments.create), or assignments.create against an
 *          ORG_ONLY problem set in the other tenant.
 *   3. No write / audit side effect happens before the refusal. Any
 *      `prisma.X.{create,update,delete}` call in the refusal path
 *      indicates a leak even if the thrown error *looks* right.
 *
 * The fake Prisma here returns only the two seeded class / assignment /
 * problem-set rows. Every write method throws so a regression that
 * silently proceeded past the tenant guard would either (a) surface as
 * a non-TRPCError error (caught by `expectTrpcCode`) or (b) be caught
 * by the explicit `not.toHaveBeenCalled` assertions.
 */
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { appRouter } from "@/lib/trpc/router";
import type { OrganizationMembershipContext } from "@/lib/organizations";

// --- fixtures ---------------------------------------------------------------

const ORG_A = { id: "org_a", name: "Alpha Academy", slug: "alpha" };
const ORG_B = { id: "org_b", name: "Bravo Borough", slug: "bravo" };

const TEACHER_A_ID = "teacher_a";
const TEACHER_B_ID = "teacher_b";

const CLASS_A = {
  id: "class_a",
  organizationId: ORG_A.id,
  createdByUserId: TEACHER_A_ID
};
const CLASS_B = {
  id: "class_b",
  organizationId: ORG_B.id,
  createdByUserId: TEACHER_B_ID
};

const ASSIGN_A = { id: "assign_a", classId: CLASS_A.id };
const ASSIGN_B = { id: "assign_b", classId: CLASS_B.id };

const PS_A = {
  id: "ps_a",
  title: "Alpha's ORG_ONLY set",
  visibility: "ORG_ONLY" as const,
  ownerOrganizationId: ORG_A.id
};
const PS_B = {
  id: "ps_b",
  title: "Bravo's ORG_ONLY set",
  visibility: "ORG_ONLY" as const,
  ownerOrganizationId: ORG_B.id
};

// --- harness ----------------------------------------------------------------

function sessionFor(userId: string): Session {
  return {
    user: {
      id: userId,
      email: `${userId}@example.com`,
      role: "TEACHER"
    },
    expires: new Date(Date.now() + 60_000).toISOString()
  };
}

function membershipFor(
  org: typeof ORG_A,
  role: "OWNER" | "ADMIN" | "TEACHER"
): OrganizationMembershipContext {
  return {
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    role
  };
}

/**
 * Build a fake Prisma that satisfies the *reads* teacher.* will perform on
 * the refusal paths, and raises on every write. Using `OWNER` on the
 * caller's membership means our tests also cover the
 * `canManageOrganization` branch in `assertCanManageClass` — the check
 * that must still refuse even an org-admin when the class is in another
 * tenant.
 */
function createIsolationFakePrisma() {
  // Any write that actually executes means the tenant guard leaked — we
  // want the test to fail loudly, not silently proceed.
  const refuseWrite = (method: string) =>
    vi.fn(async () => {
      throw new Error(
        `Unexpected prisma.${method} call in a cross-tenant test — the tenant guard should have short-circuited first`
      );
    });

  return {
    class: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        if (args.where.id === CLASS_A.id) {
          return {
            id: CLASS_A.id,
            name: "Alpha class",
            joinCode: "ALPHA1",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            organizationId: CLASS_A.organizationId,
            createdByUserId: CLASS_A.createdByUserId,
            enrollments: [],
            assignments: []
          };
        }
        if (args.where.id === CLASS_B.id) {
          return {
            id: CLASS_B.id,
            name: "Bravo class",
            joinCode: "BRAVO1",
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
            organizationId: CLASS_B.organizationId,
            createdByUserId: CLASS_B.createdByUserId,
            enrollments: [],
            assignments: []
          };
        }
        return null;
      }),
      update: refuseWrite("class.update"),
      delete: refuseWrite("class.delete"),
      create: refuseWrite("class.create")
    },
    classAssignment: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        if (args.where.id === ASSIGN_A.id) {
          return {
            id: ASSIGN_A.id,
            title: "Alpha assignment",
            dueAt: null,
            classId: ASSIGN_A.classId,
            problemSetId: PS_A.id,
            createdByUserId: CLASS_A.createdByUserId,
            class: {
              organizationId: ORG_A.id,
              createdByUserId: CLASS_A.createdByUserId,
              enrollments: []
            },
            problemSet: { _count: { problems: 0 } }
          };
        }
        if (args.where.id === ASSIGN_B.id) {
          return {
            id: ASSIGN_B.id,
            title: "Bravo assignment",
            dueAt: null,
            classId: ASSIGN_B.classId,
            problemSetId: PS_B.id,
            createdByUserId: CLASS_B.createdByUserId,
            class: {
              organizationId: ORG_B.id,
              createdByUserId: CLASS_B.createdByUserId,
              enrollments: []
            },
            problemSet: { _count: { problems: 0 } }
          };
        }
        return null;
      }),
      create: refuseWrite("classAssignment.create"),
      delete: refuseWrite("classAssignment.delete"),
      update: refuseWrite("classAssignment.update")
    },
    problemSet: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        if (args.where.id === PS_A.id) return { ...PS_A };
        if (args.where.id === PS_B.id) return { ...PS_B };
        return null;
      })
    },
    enrollment: {
      findUnique: refuseWrite("enrollment.findUnique"),
      create: refuseWrite("enrollment.create"),
      delete: refuseWrite("enrollment.delete")
    },
    organizationMembership: {
      upsert: refuseWrite("organizationMembership.upsert"),
      count: refuseWrite("organizationMembership.count"),
      findFirst: refuseWrite("organizationMembership.findFirst")
    },
    organization: {
      findUnique: refuseWrite("organization.findUnique")
    },
    user: {
      findUnique: refuseWrite("user.findUnique"),
      create: refuseWrite("user.create")
    },
    practiceRun: {
      findMany: refuseWrite("practiceRun.findMany")
    },
    auditLogEvent: {
      // logAudit wraps create in try/catch and swallows errors — so if a
      // leak ever got here we wouldn't see a thrown error, just a spy
      // call count. That's fine: the explicit `not.toHaveBeenCalled`
      // assertions below are the real check.
      create: refuseWrite("auditLogEvent.create")
    }
  };
}

type IsolationFake = ReturnType<typeof createIsolationFakePrisma>;

function callerForOrgA(prisma: IsolationFake) {
  return appRouter.createCaller({
    prisma: prisma as never,
    session: sessionFor(TEACHER_A_ID),
    membership: membershipFor(ORG_A, "OWNER")
  });
}

/**
 * Assert that a tRPC call rejects with a TRPCError of a specific code.
 * Rejecting with *any other* error (including the sentinel thrown by
 * `refuseWrite`) fails the test with a useful message rather than
 * matching on `.toBeInstanceOf(TRPCError)` alone, which would hide leaks
 * that happened to surface as TypeErrors.
 */
async function expectTrpcCode<T>(
  promise: Promise<T>,
  expectedCode: TRPCError["code"]
): Promise<void> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof TRPCError) {
      expect(err.code).toBe(expectedCode);
      return;
    }
    throw new Error(
      `Expected TRPCError with code ${expectedCode}, but got ${
        err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      }`
    );
  }
  throw new Error(
    `Expected TRPCError with code ${expectedCode}, but the procedure resolved successfully — this is a cross-tenant leak`
  );
}

// --- tests ------------------------------------------------------------------

describe("cross-tenant isolation for teacher.classes.*", () => {
  it("teacher.classes.get refuses another org's classId with NOT_FOUND", async () => {
    const prisma = createIsolationFakePrisma();
    const caller = callerForOrgA(prisma);
    await expectTrpcCode(
      caller.teacher.classes.get({ classId: CLASS_B.id }),
      "NOT_FOUND"
    );
    // Read-only procedure, but make sure we didn't accidentally kick off
    // any mutation as a "side channel."
    expect(prisma.class.update).not.toHaveBeenCalled();
    expect(prisma.class.delete).not.toHaveBeenCalled();
    expect(prisma.auditLogEvent.create).not.toHaveBeenCalled();
  });

  it("teacher.classes.update refuses another org's classId with FORBIDDEN", async () => {
    const prisma = createIsolationFakePrisma();
    const caller = callerForOrgA(prisma);
    await expectTrpcCode(
      caller.teacher.classes.update({
        classId: CLASS_B.id,
        name: "sneakily renamed"
      }),
      "FORBIDDEN"
    );
    expect(prisma.class.update).not.toHaveBeenCalled();
    expect(prisma.auditLogEvent.create).not.toHaveBeenCalled();
  });

  it("teacher.classes.delete refuses another org's classId with NOT_FOUND", async () => {
    const prisma = createIsolationFakePrisma();
    const caller = callerForOrgA(prisma);
    await expectTrpcCode(
      caller.teacher.classes.delete({ classId: CLASS_B.id }),
      "NOT_FOUND"
    );
    expect(prisma.class.delete).not.toHaveBeenCalled();
    expect(prisma.auditLogEvent.create).not.toHaveBeenCalled();
  });

  it("teacher.classes.inviteStudents refuses another org's classId with FORBIDDEN", async () => {
    const prisma = createIsolationFakePrisma();
    const caller = callerForOrgA(prisma);
    await expectTrpcCode(
      caller.teacher.classes.inviteStudents({
        classId: CLASS_B.id,
        students: [{ email: "newstudent@example.com", name: "New Student" }]
      }),
      "FORBIDDEN"
    );
    // Must not have read seat counts, inserted a user, upserted a
    // membership, or attached an enrollment — all of those would be
    // cross-tenant writes.
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(prisma.organizationMembership.upsert).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.enrollment.create).not.toHaveBeenCalled();
    expect(prisma.auditLogEvent.create).not.toHaveBeenCalled();
  });

  it("teacher.classes.removeStudent refuses another org's classId with FORBIDDEN", async () => {
    const prisma = createIsolationFakePrisma();
    const caller = callerForOrgA(prisma);
    await expectTrpcCode(
      caller.teacher.classes.removeStudent({
        classId: CLASS_B.id,
        enrollmentId: "enr_anything"
      }),
      "FORBIDDEN"
    );
    expect(prisma.enrollment.findUnique).not.toHaveBeenCalled();
    expect(prisma.enrollment.delete).not.toHaveBeenCalled();
    expect(prisma.auditLogEvent.create).not.toHaveBeenCalled();
  });
});

describe("cross-tenant isolation for teacher.assignments.*", () => {
  it("teacher.assignments.progress refuses another org's assignmentId with NOT_FOUND", async () => {
    const prisma = createIsolationFakePrisma();
    const caller = callerForOrgA(prisma);
    await expectTrpcCode(
      caller.teacher.assignments.progress({ assignmentId: ASSIGN_B.id }),
      "NOT_FOUND"
    );
    // Practice-run aggregation MUST NOT run across the tenant boundary.
    expect(prisma.practiceRun.findMany).not.toHaveBeenCalled();
  });

  it("teacher.assignments.create refuses another org's classId with FORBIDDEN (caller's own problemSet)", async () => {
    const prisma = createIsolationFakePrisma();
    const caller = callerForOrgA(prisma);
    await expectTrpcCode(
      caller.teacher.assignments.create({
        classId: CLASS_B.id,
        problemSetId: PS_A.id
      }),
      "FORBIDDEN"
    );
    // Guard runs before problemSet visibility is even checked — so a
    // leak here could create B's class an assignment using A's set.
    expect(prisma.classAssignment.create).not.toHaveBeenCalled();
    expect(prisma.problemSet.findUnique).not.toHaveBeenCalled();
    expect(prisma.auditLogEvent.create).not.toHaveBeenCalled();
  });

  it("teacher.assignments.create refuses another org's ORG_ONLY problemSet with FORBIDDEN", async () => {
    const prisma = createIsolationFakePrisma();
    const caller = callerForOrgA(prisma);
    await expectTrpcCode(
      caller.teacher.assignments.create({
        classId: CLASS_A.id, // caller's own class
        problemSetId: PS_B.id // other org's ORG_ONLY set
      }),
      "FORBIDDEN"
    );
    expect(prisma.classAssignment.create).not.toHaveBeenCalled();
    expect(prisma.auditLogEvent.create).not.toHaveBeenCalled();
  });

  it("teacher.assignments.delete refuses another org's assignmentId with NOT_FOUND", async () => {
    const prisma = createIsolationFakePrisma();
    const caller = callerForOrgA(prisma);
    await expectTrpcCode(
      caller.teacher.assignments.delete({ assignmentId: ASSIGN_B.id }),
      "NOT_FOUND"
    );
    expect(prisma.classAssignment.delete).not.toHaveBeenCalled();
    expect(prisma.auditLogEvent.create).not.toHaveBeenCalled();
  });
});

describe("cross-tenant isolation for teacher.* — payload-shape guard", () => {
  it("never returns org B's data to a caller in org A (all queries reject)", async () => {
    // Belt-and-suspenders: even if one of the specific-code tests above
    // drifted out of sync with the router, this sweep catches the one
    // regression shape that actually matters: a successful response
    // carrying B's row. Every call here MUST reject.
    const prisma = createIsolationFakePrisma();
    const caller = callerForOrgA(prisma);

    const calls: Array<Promise<unknown>> = [
      caller.teacher.classes.get({ classId: CLASS_B.id }),
      caller.teacher.classes.update({ classId: CLASS_B.id, name: "no" }),
      caller.teacher.classes.delete({ classId: CLASS_B.id }),
      caller.teacher.classes.inviteStudents({
        classId: CLASS_B.id,
        students: [{ email: "e@example.com" }]
      }),
      caller.teacher.classes.removeStudent({
        classId: CLASS_B.id,
        enrollmentId: "enr_x"
      }),
      caller.teacher.assignments.progress({ assignmentId: ASSIGN_B.id }),
      caller.teacher.assignments.create({
        classId: CLASS_B.id,
        problemSetId: PS_A.id
      }),
      caller.teacher.assignments.delete({ assignmentId: ASSIGN_B.id })
    ];

    const settled = await Promise.allSettled(calls);
    for (const result of settled) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(TRPCError);
      }
    }

    // And confirm no writes leaked through the sweep as a whole.
    expect(prisma.class.update).not.toHaveBeenCalled();
    expect(prisma.class.delete).not.toHaveBeenCalled();
    expect(prisma.classAssignment.create).not.toHaveBeenCalled();
    expect(prisma.classAssignment.delete).not.toHaveBeenCalled();
    expect(prisma.enrollment.create).not.toHaveBeenCalled();
    expect(prisma.enrollment.delete).not.toHaveBeenCalled();
    expect(prisma.organizationMembership.upsert).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.auditLogEvent.create).not.toHaveBeenCalled();
  });
});
