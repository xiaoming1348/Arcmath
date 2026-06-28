import type { Session } from "next-auth";
import { isPlatformOperator } from "@/lib/platform-operator";

export const FREE_RESOURCE_SET_LIMIT = 3;

function isAccessGatingDisabled(): boolean {
  const flag = process.env.DISABLE_ACCESS_GATING?.trim().toLowerCase() ?? "";
  return flag === "1" || flag === "true" || flag === "yes";
}

export function hasActiveMembership(session: Session | null | undefined): boolean {
  if (!session?.user) {
    return false;
  }

  if (isAccessGatingDisabled()) {
    return true;
  }

  // Platform-operator emails (configured via PLATFORM_OPERATOR_EMAILS
  // env var) bypass paid-membership checks for ops convenience.
  // Previously this was gated on User.role === "ADMIN", which
  // conflated platform-operator with the org-internal "ADMIN" role
  // a teacher might give a school OWNER. Migrated to the env-var
  // allowlist so org-level admin roles can no longer leak
  // platform-operator power.
  if (isPlatformOperator(session.user.email)) {
    return true;
  }

  // Placeholder: payment/membership integration will populate real status later.
  return false;
}
