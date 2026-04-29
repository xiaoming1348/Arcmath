import { Prisma } from "@arcmath/db";
import type { PrismaClient } from "@arcmath/db";

/**
 * Record an audit event. Designed to be fire-and-forget from inside
 * tRPC mutations: write the row after the primary effect succeeds,
 * and swallow any error so a broken audit table can never break a
 * teacher's invite-students flow.
 *
 * This is intentionally loose-typed on `action`. We could tighten it
 * to a union, but the pilot is still discovering which actions matter;
 * a string column lets us log new events without a schema migration.
 * Analytics + dashboards SHOULD namespace actions ("teacher.invite",
 * "teacher.class.regenerate_join_code", "admin.problem_set.publish")
 * so they group naturally.
 */
export type AuditActor = {
  userId: string | null;
  organizationId: string | null;
};

export type AuditEvent = {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  payload?: Record<string, unknown> | null;
};

export async function logAudit(
  prisma: PrismaClient | Prisma.TransactionClient,
  actor: AuditActor,
  event: AuditEvent
): Promise<void> {
  try {
    await prisma.auditLogEvent.create({
      data: {
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        payload:
          event.payload == null
            ? Prisma.DbNull
            : (event.payload as Prisma.InputJsonValue)
      }
    });
  } catch (err) {
    // Log-and-continue: audit failures must never cascade back into
    // the mutation path. A dropped audit row is strictly less bad
    // than a failed teacher invite.
    // eslint-disable-next-line no-console
    console.warn("[audit] failed to record event", event.action, err);
  }
}
