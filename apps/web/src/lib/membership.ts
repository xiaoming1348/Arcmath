import type { Session } from "next-auth";

export const FREE_RESOURCE_SET_LIMIT = 3;

export function hasActiveMembership(session: Session | null | undefined): boolean {
  if (!session?.user) {
    return false;
  }

  if (session.user.role === "ADMIN") {
    return true;
  }

  // Placeholder: payment/membership integration will populate real status later.
  return false;
}
