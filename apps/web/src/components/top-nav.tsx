import Link from "next/link";
import type { Session } from "next-auth";
import { canAccessAdmin } from "@arcmath/shared";
import { prisma } from "@arcmath/db";
import { LogoutButton } from "@/components/logout-button";
import { canManageOrganization, getActiveOrganizationMembership } from "@/lib/organizations";

type TopNavProps = {
  session: Session | null;
};

export async function TopNav({ session }: TopNavProps) {
  const isLoggedIn = Boolean(session?.user);
  const organizationMembership = session?.user ? await getActiveOrganizationMembership(prisma, session.user.id) : null;
  const isOrganizationManager = organizationMembership ? canManageOrganization(organizationMembership.role) : false;
  const canSeePlatformAdmin = canAccessAdmin(session?.user?.role);

  return (
    <header className="motion-rise surface-card relative overflow-hidden px-5 py-4 md:px-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(30,102,245,0.55),transparent)]" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-52 w-52 rounded-full bg-[rgba(30,102,245,0.12)] blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-0 h-36 w-36 rounded-full bg-[rgba(17,167,161,0.12)] blur-3xl" />

      <div className="relative flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-3 rounded-[1.4rem] border border-white/60 bg-white/70 px-3 py-3 shadow-[0_18px_40px_rgba(16,35,60,0.08)] backdrop-blur-xl transition hover:bg-white/90"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--accent),var(--accent-secondary))] text-base font-bold text-white shadow-[0_14px_28px_rgba(30,102,245,0.28)]">
              A
            </span>
            <span className="space-y-1 text-left">
              <span className="block text-base font-semibold tracking-[-0.03em] text-slate-900">ArcMath</span>
              <span className="block text-xs uppercase tracking-[0.24em] text-slate-500">
                Focused math practice
              </span>
            </span>
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-2">
            {isLoggedIn ? (
              <>
                <Link href="/dashboard" className="route-chip">
                  Dashboard
                </Link>
                {organizationMembership ? (
                  <Link href="/org" className="route-chip">
                    Organization
                  </Link>
                ) : null}
                {isOrganizationManager ? (
                  <>
                    <Link href="/assignments" className="route-chip">
                      Assignments
                    </Link>
                    <Link href="/resources" className="route-chip">
                      Resources
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/problems" className="route-chip">
                      Problems
                    </Link>
                    <Link href="/reports" className="route-chip">
                      Reports
                    </Link>
                    {organizationMembership ? (
                      <>
                        <Link href="/assignments" className="route-chip">
                          Assignments
                        </Link>
                        <Link href="/resources" className="route-chip">
                          Resources
                        </Link>
                      </>
                    ) : (
                      <Link href="/membership" className="route-chip">
                        Membership
                      </Link>
                    )}
                  </>
                )}
                {canSeePlatformAdmin ? (
                  <Link href="/admin" className="route-chip">
                    Admin
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <Link href="/login" className="route-chip">
                  Login
                </Link>
                <Link href="/register" className="route-chip">
                  Register
                </Link>
              </>
            )}
          </nav>

          {isLoggedIn ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[1.3rem] border border-white/60 bg-white/75 px-4 py-3 shadow-[0_16px_34px_rgba(16,35,60,0.06)]">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Account</div>
                <p className="text-sm text-slate-600">{session?.user?.email}</p>
              </div>
              <LogoutButton />
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
