/**
 * Periodic DB ping to prevent the Neon serverless pooler from
 * closing idle connections.
 *
 * Symptom we're fixing:
 *   pm2 logs showed recurring
 *     `prisma:error Error in PostgreSQL connection: Error { kind: Closed }`
 *   This happens because the Neon pgbouncer pooler (us-east-1) closes
 *   idle TCP connections after a few minutes. When the next user-
 *   triggered query lands on a closed socket, Prisma transparently
 *   reconnects — but the full TCP + TLS + auth handshake from
 *   HK VPS to us-east-1 costs ~800-1000ms before the actual query
 *   can run. That extra second is what made the UI feel "click and
 *   wait half a day".
 *
 * Fix: run a no-op `SELECT 1` every 4 minutes. The pooler treats it
 * as activity and keeps the socket warm. Subsequent real queries
 * skip the reconnect and pay only the per-query ~200ms RTT.
 *
 * Cost: 2 PM2 workers × 1 query per 4 minutes × 720 minutes/day
 *       = 360 trivial queries/day. Neon free tier handles this with
 *       zero noticeable usage.
 *
 * Long-term: a proper fix is moving to `@prisma/adapter-neon` (HTTP-
 * based, no idle TCP) or relocating the DB to ap-southeast-1 to drop
 * RTT below 50ms. Both planned. This keep-alive is the 15-minute
 * stopgap that prevents the user-visible 1-second clicks today.
 */

import { prisma } from "@arcmath/db";

const PING_INTERVAL_MS = 4 * 60 * 1000;
const PING_LABEL = "[db-keepalive]";

let started = false;

export function startDbKeepalive() {
  // Guard against double-start: instrumentation can fire more than
  // once if hot-reloading is enabled, and we don't want overlapping
  // intervals.
  if (started) return;
  started = true;

  // Only run in production. Dev servers restart often and the local
  // DB isn't on a serverless pooler, so the ping is just noise there.
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  // Fire once at boot to fail fast if DATABASE_URL is wrong — we'd
  // rather see a startup error than discover it 4 minutes later.
  prisma.$queryRaw`SELECT 1`.catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(`${PING_LABEL} initial ping failed:`, err);
  });

  setInterval(() => {
    prisma.$queryRaw`SELECT 1`.catch((err) => {
      // Don't crash the app on a transient failure — Prisma will
      // reconnect on the next query. Logging makes it greppable in
      // pm2 logs so we can spot trends.
      // eslint-disable-next-line no-console
      console.warn(`${PING_LABEL} ping failed:`, err);
    });
  }, PING_INTERVAL_MS).unref?.(); // unref so the interval doesn't keep the process alive on shutdown
}
