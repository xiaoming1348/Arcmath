# Multi-tenant isolation audit

Pilot scope: every school tenant gets its own `Organization` row and a set
of `OrganizationMembership` rows connecting users to the tenant. This doc
enumerates the isolation contract used across the tRPC layer, the server
components, and the Prisma schema — so a reviewer can tell, at a glance,
where tenant scoping is enforced and where it is intentionally absent.

Last reviewed: 2026-04-22 (pilot milestone — end of Phase 5).

## 1. Isolation primitives

### 1.1 Procedure middleware (apps/web/src/lib/trpc/server.ts)

| Procedure | Session required | Membership required | Who it admits | `ctx.membership` on success |
|-----------|------------------|---------------------|---------------|-----------------------------|
| `publicProcedure` | no | no | anyone | may be null |
| `protectedProcedure` | yes | no | any signed-in user | may be null |
| `teacherProcedure` | yes | yes (role ∈ OWNER/ADMIN/TEACHER) **or** platform `ADMIN` + attached tenant | tenant teachers and above | non-null |
| `schoolAdminProcedure` | yes | yes (role ∈ OWNER/ADMIN) **or** platform `ADMIN` + attached tenant | tenant admins and above | non-null |
| `adminProcedure` | yes | no | platform `ADMIN` only | may be null |

Key invariant: every tRPC call that should be tenant-scoped goes through
`teacherProcedure` or `schoolAdminProcedure`, which guarantees
`ctx.membership.organizationId` is set. `adminProcedure` (platform admin)
is deliberately cross-tenant — it's the only surface that can read across
organizations.

`ctx.membership` is resolved once in `createTRPCContext` by
`getActiveOrganizationMembership` (orders by role asc, createdAt asc, then
picks the first `ACTIVE` row). Users with at most one active membership
have an unambiguous tenant; the `joinClass` flow refuses to create a
second active membership, so this ordering never matters in practice.

### 1.2 Server-component guards

The app-router pages repeat the same pattern:

```ts
const session = await getServerSession(authOptions);
if (!session?.user) redirect("/login?callbackUrl=...");
if (!canAccessAdmin(session.user.role)) redirect("/unauthorized");
```

Tenant data itself is never fetched in the server component — the server
component is a thin shell that renders a client `<Panel>` which runs its
tRPC queries through the properly-scoped procedure. This means tenant
scoping lives in exactly one place per feature: the router.

### 1.3 Audit trail

`AuditLogEvent` (packages/db/prisma/schema.prisma) is an append-only table
keyed on `(actorUserId, organizationId, action, targetType, targetId,
payload, createdAt)`. Writes go through `logAudit()` (apps/web/src/lib/audit.ts)
which swallows errors so a failed audit never blocks the mutation.

## 2. Tenant-scoped vs. global tables

**Tenant-scoped** — every row belongs to exactly one organization:
- `Organization`
- `OrganizationMembership` (unique on `organizationId + userId`)
- `Class` (has `organizationId`; every `Class.findMany` in tenant code
  filters by it)
- `Enrollment` (class-scoped, inherits tenant from the class)
- `ClassAssignment` (class-scoped, inherits tenant from the class —
  see gap in §4)
- `AuditLogEvent.organizationId` (nullable; null = platform-wide event)

**User-scoped but tenant-attributed** — row keyed on `userId`, with a
denormalized `organizationId` for analytics roll-up:
- `PracticeRun.organizationId` (populated from
  `assignment.class.organizationId` when started through the student
  home; null for self-directed runs)

**User-scoped, no tenant attribution** — accessed only as "the caller's
own rows" via `userId` filters:
- `ProblemAttempt`
- `AttemptStep`
- `ProblemHintUsage`

**Global / catalog** — not tenant-scoped by design:
- `ProblemSet`, `Problem` — contest content (AMC/AIME, Chinese
  olympiads) is shared across all tenants. Access is gated by
  membership entitlement and the free-tier limit, *not* by tenant.
- `ResourceAccessGrant` — keyed on `userId + problemSetId`, not on
  tenant; pre-dates the multi-tenant rewrite.

## 3. Per-router audit

### 3.1 `admin.analytics` (adminProcedure — cross-tenant)
- `schools` returns one row per org; intentionally reads every tenant.
- `auditLog` returns the audit table filtered by optional
  `organizationId`; when omitted, returns platform-wide events.
- OK because `adminProcedure` is the only way in.

### 3.2 `admin.import`, `admin.resourceAccess`, `admin.review` (adminProcedure)
- Mutate global catalog rows only (ProblemSet, Problem,
  ResourceAccessGrant). No tenant data touched.
- Audit calls added in `admin.review` for
  `admin.review.set_formalized_status` and
  `admin.review.set_problem_set_status`.

### 3.3 `teacher.*` (teacherProcedure)

Every query starts with `const orgId = ctx.membership!.organizationId;`
and filters on it. Class-level mutations also route through
`assertCanManageClass(prisma, { classId, organizationId, actingUserId,
actingRole })` which refuses cross-tenant class ids.

Procedures and their scoping check:

| Procedure | Scoping |
|-----------|---------|
| `teacher.overview` | `where: { organizationId: orgId, ... }` on every count |
| `teacher.classes.list` | `where.organizationId = orgId`; pure teachers also filtered by `createdByUserId` |
| `teacher.classes.get` | post-fetch check `klass.organizationId !== orgId` → NOT_FOUND |
| `teacher.classes.create` | inserts with `organizationId: orgId`, `createdByUserId: ctx.session.user.id` |
| `teacher.classes.update` | `assertCanManageClass` |
| `teacher.classes.delete` (schoolAdmin) | post-fetch check `klass.organizationId !== orgId` |
| `teacher.classes.inviteStudents` | `assertCanManageClass`; creates memberships with `organizationId: orgId`; seat check against the same org |
| `teacher.classes.removeStudent` | `assertCanManageClass` + enrollment belongs-to-class fence |
| `teacher.assignments.progress` | post-fetch check `assignment.class.organizationId !== orgId` |
| `teacher.assignments.create` | `assertCanManageClass` |
| `teacher.assignments.delete` | `assertCanManageClass` via the owning class |
| `teacher.uploadProblemSet` | inserts with `ownerOrganizationId: orgId` |
| `teacher.inviteTeachers` (schoolAdmin) | seat check against `orgId` |

### 3.4 `student.*` (protectedProcedure, userId-scoped)

Students have at most one active membership (enforced by `joinClass`), so
tenant scoping here is implicit — all queries filter by `userId`, and
every joined row (class, classAssignment, practiceRun) is reachable only
via the student's own enrollment.

| Procedure | Scoping |
|-----------|---------|
| `student.overview` | enrollments scoped by `userId`; counts joined by `classId in enrollmentClassIds` |
| `student.assignments` | `class.id in enrollmentClassIds` + `openAt` gate; runs filtered by `userId` |
| `student.joinClass` | **cross-org guard**: refuses join if caller has an active membership in a *different* org (FORBIDDEN) |
| `student.startAssignment` | explicit enrollment check before creating run; run inherits `organizationId` from `assignment.class.organizationId` |

### 3.5 `unifiedAttempt.*` (protectedProcedure, userId-scoped)

Every mutation on `ProblemAttempt`, `AttemptStep`, `ProblemHintUsage`
runs `findFirst({ where: { ..., userId } })` first. `resolvePracticeRunId`
validates `(id, userId, problemSetId)` so a caller cannot adopt another
user's run. No tenant check; by construction these rows always belong to
the caller.

### 3.6 `learningReport.getLatestReportInput` (protectedProcedure)
Scopes by `userId`; optional `runId` is also filtered by `userId`. OK.

### 3.7 `resources.*` / `resourceSets.*` (protectedProcedure)
Reads global catalog rows; no tenant scoping by design.
`ResourceAccessGrant` uses `userId + problemSetId`. The free-tier limit
check is user-level, not tenant-level — pilot tenants all have
`planType = SCHOOL` which implies unlimited via `hasActiveMembership`.

## 4. Known gaps & follow-ups

These are intentional shortcuts for the pilot; each has a concrete
hardening path if we outgrow it.

1. **`ClassAssignment.organizationId` is derived, not stored.** Every
   query that filters assignments by tenant does so via the `class`
   relation (`where: { class: { organizationId: orgId } }` or a post-fetch
   check). A new query that forgets the join would silently leak
   cross-tenant data. Two mitigations, pick one if the surface grows:
   - denormalize `organizationId` onto `ClassAssignment` (cheap column
     + backfill migration), or
   - add a shared helper `scopedAssignmentWhere(orgId)` and require its
     use via an ESLint rule.

2. **`PracticeRun.organizationId` is nullable.** Self-directed runs (no
   `classAssignmentId`) do not carry a tenant. `admin.analytics.schools`
   only counts runs with a tenant, which is correct. But a future
   "all runs for org X this week" query needs to decide whether to
   count self-directed runs at all — there is no way to attribute them
   retroactively.

3. **Catalog tables (`ProblemSet`, `Problem`) are global.** This is the
   right call for contest content, but it means a teacher-uploaded
   problem set (`ProblemSet.ownerOrganizationId` populated) is visible
   via `resources.byId` / `resources.byKey` to any authenticated user,
   not just the owning tenant. For the pilot this is acceptable because
   teacher uploads are treated as "share with everyone." If a school
   demands private uploads, add an `isPrivate` flag and gate
   `resources.*` accordingly.

4. **`OrganizationMembership` ordering.** Context build picks the first
   active membership by `(role asc, createdAt asc)`. A user with
   multiple active memberships would land on the alphabetically-first
   role. Today this cannot happen — `joinClass` enforces single-org,
   and `teacher.classes.inviteStudents` reuses existing users only if
   they're already in the same org. If we ever add a
   cross-school-invite flow (e.g., a student transfers), the tenant
   picker needs a UI and a persisted "current tenant" cookie.

5. **Global admin "act as a teacher."** `enforceTeacher` lets a
   platform `ADMIN` through without a tenant role, as long as
   `ctx.membership` is populated. The admin still needs to be attached
   to a tenant via `OrganizationMembership` to get a membership — but
   our seed data and support playbook attach admins to a sentinel
   "ArcMath Ops" org. Any teacher-mutating action taken by a platform
   admin is recorded with their `actorUserId` in `AuditLogEvent`, so
   incident response can reconstruct who did what.

6. **Legacy classes without `organizationId`.** Early dev data has
   classes with `organizationId = null`. `student.joinClass` refuses
   these paths (returns NOT_FOUND with "Invalid join code"). A cleanup
   migration ahead of real pilot data will drop these rows.

## 5. Testing recommendations

The isolation contract is enforced by hand today. Before we onboard
more than the first three pilot schools, add:

1. **Negative integration tests** for every tenant-scoped procedure:
   seed two orgs A and B, call each procedure with an A-caller passing
   B-owned ids, assert the response is NOT_FOUND (never 200 with leaked
   data). **Implemented** —
   `apps/web/src/lib/trpc/teacher-router-cross-tenant.test.ts` covers
   every procedure in §3.3 (`teacher.classes.{get,update,delete,
   inviteStudents,removeStudent}`, `teacher.assignments.{progress,
   create,delete}`) plus the ORG_ONLY problem-set visibility path in
   `assignments.create`. A refusal asserts both the error code
   (NOT_FOUND / FORBIDDEN) and that no write or audit side-effect
   reached the fake Prisma. A full-DB integration run is deferred
   until we have a test database in CI.
2. **A lint rule** forbidding `prisma.class.findUnique` /
   `prisma.classAssignment.findUnique` in tRPC routers without a
   matching `organizationId` check in the same function — OR prefer the
   `assertCanManageClass` / a new `assertCanReadAssignment` helper.
3. **A weekly job** that scans `AuditLogEvent` for any action where
   `organizationId` is null but `actorUserId` is non-admin — the
   expected set is empty.
