import type { Session } from "next-auth";

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

  if (session.user.role === "ADMIN") {
    return true;
  }

  // Placeholder: payment/membership integration will populate real status later.
  return false;
}
