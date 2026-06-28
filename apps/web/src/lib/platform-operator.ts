/**
 * Platform-level operator gating.
 *
 * Historically the codebase used `User.role === "ADMIN"` to gate
 * platform-admin pages (/admin/ocr-stats etc.) and to grant
 * platform-wide bypasses (free membership, free tutor access).
 *
 * Semantically that's wrong: User.role is supposed to express the
 * caller's *role inside an Organization* (STUDENT / TEACHER /
 * OWNER / ADMIN-of-an-org). Using it to also mean "you can see
 * the platform admin console" overloads one column with two
 * unrelated concepts and leaks platform-operator power to anyone
 * an org promotes to ADMIN.
 *
 * This helper is the migration path: gating now reads from a
 * comma-separated `PLATFORM_OPERATOR_EMAILS` env var. It does
 * NOT inspect User.role at all. The env var lives in
 * `apps/web/.env.local` on each environment (dev / staging /
 * prod) and stays out of the database — operator privilege is a
 * deployment-level concern, not user data.
 *
 * Format:
 *   PLATFORM_OPERATOR_EMAILS=yiming@example.com,ops@example.com
 *
 * Empty / unset → nobody is an operator (locks the admin pages
 * down completely).
 */

let cachedSet: Set<string> | null = null;

function loadOperatorSet(): Set<string> {
  if (cachedSet) return cachedSet;
  const raw = process.env.PLATFORM_OPERATOR_EMAILS ?? "";
  const emails = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  cachedSet = new Set(emails);
  return cachedSet;
}

/**
 * Returns true when the given email is in the configured operator
 * allowlist. Matching is case-insensitive on the local part and
 * domain — the env var is normalized to lower-case at load time
 * and the input is lower-cased here.
 */
export function isPlatformOperator(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  return loadOperatorSet().has(email.trim().toLowerCase());
}

/** Test-only: reset the lazy cache so tests can inject env. */
export function __resetPlatformOperatorCacheForTesting(): void {
  cachedSet = null;
}
