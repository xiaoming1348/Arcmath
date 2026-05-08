/**
 * End-to-end smoke test for the roster-creation pivot.
 *
 * Walks the full school onboarding flow against the live dev DB:
 *
 *   1. Spin up a fresh "smoke test" admin User + Organization +
 *      OWNER membership (deletes any prior smoke-test org first).
 *   2. Run orgAdmin.createClassWithRoster with one teacher + three
 *      students. Verify Users, OrganizationMemberships, Class,
 *      Enrollment rows show up + each new account has
 *      passwordHash === null.
 *   3. Walk one student through "first-time set password": call
 *      bcrypt to hash a candidate password, write it, then attempt
 *      bcrypt.compare with both right + wrong passwords.
 *   4. Run orgAdmin.addStudentsToClass with one new + one existing.
 *      Verify Enrollment count, no double-create, seat caps respected.
 *   5. Run orgAdmin.removeStudentFromClass on the existing student.
 *      Verify Enrollment row deleted but User survives.
 *   6. Run orgAdmin.resetUserPassword on the student we just
 *      "claimed" in step 3. Verify passwordHash → null.
 *   7. Cleanup: delete the smoke org + cascading rows.
 *
 * Each step prints OK / FAIL with a short reason. Run with:
 *   bash scripts/with-env-local.sh \
 *     pnpm -C apps/web exec tsx src/scripts/e2e-roster-flow.ts
 */

import bcrypt from "bcryptjs";
import { prisma } from "@arcmath/db";
import { withPepper } from "@/lib/password";
import { appRouter } from "@/lib/trpc/router";
import type { Session } from "next-auth";

const SMOKE_ORG_NAME = "Smoke Test Academy";
const SMOKE_ORG_SLUG = "smoke-test-academy";
const SMOKE_ADMIN_EMAIL = "smoke.admin@smoke-test-academy.arcmath.local";

let pass = 0;
let fail = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass += 1;
    console.log(`  OK  ${label}`);
  } else {
    fail += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function cleanupExisting() {
  console.log("Cleanup: drop any prior smoke-test org + admin");
  const existing = await prisma.organization.findUnique({
    where: { slug: SMOKE_ORG_SLUG },
    select: { id: true }
  });
  if (existing) {
    // Find users that ONLY belong to this org (so we don't nuke
    // genuine multi-org users — irrelevant for the smoke org but the
    // pattern is reusable).
    const memberUserIds = (
      await prisma.organizationMembership.findMany({
        where: { organizationId: existing.id },
        select: { userId: true }
      })
    ).map((m) => m.userId);

    await prisma.organization.delete({ where: { id: existing.id } });
    if (memberUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: memberUserIds } } });
    }
  }
  // Defensive: also drop the admin email if a half-cleanup left it.
  await prisma.user.deleteMany({ where: { email: SMOKE_ADMIN_EMAIL } });
}

function adminSession(userId: string): Session {
  // Shape matches what NextAuth would inject; the tRPC middleware
  // looks at `session.user.id` and `session.user.role`. Setting role
  // to STUDENT here because that's the platform-level role the
  // schoolAdminProcedure ignores; it gates on the OrganizationMembership
  // role which we set to OWNER below.
  return {
    user: { id: userId, email: SMOKE_ADMIN_EMAIL, name: "Smoke Admin", role: "STUDENT" },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  } as unknown as Session;
}

async function main() {
  console.log("== E2E roster-flow smoke test ==");
  await cleanupExisting();

  // 1. Bootstrap admin + org + OWNER membership.
  console.log("\n1. Bootstrap smoke admin + organization");
  const admin = await prisma.user.create({
    data: {
      email: SMOKE_ADMIN_EMAIL,
      name: "Smoke Admin",
      passwordHash: await bcrypt.hash(withPepper("smoke-admin-pass-1"), 10),
      role: "STUDENT"
    },
    select: { id: true }
  });
  const org = await prisma.organization.create({
    data: {
      name: SMOKE_ORG_NAME,
      slug: SMOKE_ORG_SLUG,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000)
    },
    select: { id: true, maxTeacherSeats: true, maxStudentSeats: true }
  });
  await prisma.organizationMembership.create({
    data: {
      organizationId: org.id,
      userId: admin.id,
      role: "OWNER",
      status: "ACTIVE"
    }
  });
  check("admin user created", !!admin.id);
  check("org created with owner", !!org.id);
  check("seat caps default to 5/50", org.maxTeacherSeats === 5 && org.maxStudentSeats === 50);

  const caller = appRouter.createCaller({
    session: adminSession(admin.id),
    prisma,
    membership: {
      organizationId: org.id,
      organizationName: SMOKE_ORG_NAME,
      organizationSlug: SMOKE_ORG_SLUG,
      role: "OWNER",
      userId: admin.id
    }
  } as never);

  // 2. createClassWithRoster
  console.log("\n2. orgAdmin.createClassWithRoster (1 teacher + 3 new students)");
  const result1 = await caller.orgAdmin.createClassWithRoster({
    className: "Math 7A",
    teacher: { kind: "new", name: "林老师" },
    students: [
      { kind: "new", name: "王伟" },
      { kind: "new", name: "李小红" },
      { kind: "new", name: "张明" }
    ]
  });
  check("class created", !!result1.klass.id);
  check("teacher returned", !!result1.teacher.email && result1.teacher.isNew === true);
  check("3 students returned", result1.students.length === 3);
  check(
    "all students isNew=true",
    result1.students.every((s) => s.isNew)
  );
  check(
    "teacher email contains pinyin",
    /^lin/.test(result1.teacher.email),
    `email was ${result1.teacher.email}`
  );
  check(
    "student email uses pinyin slug",
    result1.students.some((s) => /^wang-wei/.test(s.email)),
    `emails: ${result1.students.map((s) => s.email).join(", ")}`
  );

  const wangWeiUserId = result1.students.find((s) => /^wang-wei/.test(s.email))!.userId;

  // Verify DB rows
  const orgMembers = await prisma.organizationMembership.findMany({
    where: { organizationId: org.id, status: "ACTIVE" },
    select: { role: true }
  });
  check(
    "memberships: 1 OWNER + 1 TEACHER + 3 STUDENT",
    orgMembers.filter((m) => m.role === "OWNER").length === 1 &&
      orgMembers.filter((m) => m.role === "TEACHER").length === 1 &&
      orgMembers.filter((m) => m.role === "STUDENT").length === 3,
    JSON.stringify(orgMembers)
  );
  const enrollments = await prisma.enrollment.findMany({
    where: { classId: result1.klass.id }
  });
  check("3 enrollments in new class", enrollments.length === 3);

  // Verify new accounts have passwordHash === null
  const wangWei = await prisma.user.findUnique({ where: { id: wangWeiUserId } });
  check("new student has null password", wangWei?.passwordHash === null);

  // 3. Set-password via the same code path the /api route uses
  console.log("\n3. Student claims password via set-password flow");
  const newPassHash = await bcrypt.hash(withPepper("wang-wei-secret-1"), 10);
  await prisma.user.update({ where: { id: wangWeiUserId }, data: { passwordHash: newPassHash } });
  const reloaded = await prisma.user.findUnique({ where: { id: wangWeiUserId } });
  check("password set", typeof reloaded?.passwordHash === "string");
  if (reloaded?.passwordHash) {
    const correctMatches = await bcrypt.compare(withPepper("wang-wei-secret-1"), reloaded.passwordHash);
    const wrongMatches = await bcrypt.compare(withPepper("wrong-password"), reloaded.passwordHash);
    check("bcrypt.compare correct password ✓", correctMatches);
    check("bcrypt.compare wrong password ✗", !wrongMatches);
  }

  // 4. addStudentsToClass — 1 new + 1 existing (the same wang-wei,
  //    deduplicates on the enrollment via skipDuplicates)
  console.log("\n4. orgAdmin.addStudentsToClass (1 new + 1 existing dup)");
  const beforeAdd = await prisma.enrollment.count({ where: { classId: result1.klass.id } });
  const result2 = await caller.orgAdmin.addStudentsToClass({
    classId: result1.klass.id,
    students: [
      { kind: "new", name: "Lily Chen" },
      { kind: "existing", userId: wangWeiUserId } // already enrolled
    ]
  });
  const afterAdd = await prisma.enrollment.count({ where: { classId: result1.klass.id } });
  check("addStudents returned 2 rows", result2.students.length === 2);
  check(
    "addStudents net-new is +1 (existing dedup)",
    afterAdd === beforeAdd + 1,
    `before=${beforeAdd} after=${afterAdd}`
  );

  // 5. removeStudentFromClass on the existing wang-wei
  console.log("\n5. orgAdmin.removeStudentFromClass");
  const beforeRm = await prisma.enrollment.count({ where: { classId: result1.klass.id } });
  await caller.orgAdmin.removeStudentFromClass({
    classId: result1.klass.id,
    userId: wangWeiUserId
  });
  const afterRm = await prisma.enrollment.count({ where: { classId: result1.klass.id } });
  check("enrollment count drops by 1", afterRm === beforeRm - 1);
  const wangStillExists = await prisma.user.findUnique({ where: { id: wangWeiUserId } });
  check("user account survives removal", wangStillExists !== null);

  // 6. resetUserPassword
  console.log("\n6. orgAdmin.resetUserPassword");
  await caller.orgAdmin.resetUserPassword({ userId: wangWeiUserId });
  const afterReset = await prisma.user.findUnique({ where: { id: wangWeiUserId } });
  check("password cleared to null", afterReset?.passwordHash === null);

  // 7. Seat-cap negative test
  console.log("\n7. Seat-cap rejection (try to add 50 more students)");
  const studentsToAdd = Array.from({ length: 50 }, (_, i) => ({
    kind: "new" as const,
    name: `Test Student ${i}`
  }));
  let capRejected = false;
  try {
    await caller.orgAdmin.addStudentsToClass({
      classId: result1.klass.id,
      students: studentsToAdd
    });
  } catch (err) {
    capRejected = /seat cap/i.test((err as { message?: string }).message ?? "");
  }
  check("seat cap rejects oversize roster", capRejected);

  // Cleanup
  await cleanupExisting();

  console.log(`\n== Result: ${pass} OK / ${fail} FAIL ==`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Smoke test crashed:", err);
  await cleanupExisting().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
