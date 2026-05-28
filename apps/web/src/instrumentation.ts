/**
 * Next.js instrumentation hook — runs once per server worker at boot.
 *
 * Used for one-time, server-only setup that can't live inside a
 * request handler. Currently:
 *   - startDbKeepalive(): periodic ping to keep the Neon pooler
 *     connection warm (see `lib/db-keepalive.ts` for full rationale).
 *
 * The `register` export is the documented Next.js convention. The
 * `runtime` guard ensures we don't try to start a node:setInterval
 * in the Edge runtime where it isn't available.
 *
 * Reference: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startDbKeepalive } = await import("./lib/db-keepalive");
  startDbKeepalive();
}
