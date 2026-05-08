import { redirect } from "next/navigation";

/**
 * Legacy `/membership` route — pre-pivot this hosted a per-user
 * "unlock premium real-set practice" demo flow. Under the school-pilot
 * roster model every active org member has catalog access via
 * `DISABLE_ACCESS_GATING`, so per-user premium gating no longer makes
 * sense. We keep the route as a permanent redirect to `/dashboard`
 * so any stale bookmarks / search-engine cache entries don't 404.
 */
export default function MembershipPage(): never {
  redirect("/dashboard");
}
