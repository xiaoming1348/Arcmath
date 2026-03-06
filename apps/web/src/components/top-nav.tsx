import Link from "next/link";
import type { Session } from "next-auth";
import { LogoutButton } from "@/components/logout-button";

type TopNavProps = {
  session: Session | null;
};

export function TopNav({ session }: TopNavProps) {
  const isLoggedIn = Boolean(session?.user);

  return (
    <header className="motion-rise flex flex-col gap-4 rounded-3xl border border-white/70 bg-white/70 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="route-chip bg-[var(--accent)] text-white shadow-[0_10px_24px_rgba(47,122,109,0.25)] hover:bg-[var(--accent-strong)]"
          >
            ArcMath
          </Link>
          <span className="badge">MVP-0</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {session?.user ? "Signed in" : "Guest mode"}
          </div>
          <p className="text-sm text-slate-600">
            {session?.user ? `${session.user.email} (${session.user.role})` : "Not signed in"}
          </p>
          {isLoggedIn ? <LogoutButton /> : null}
        </div>
      </div>

      <nav className="flex flex-wrap gap-2">
        {isLoggedIn ? (
          <>
            <Link href="/dashboard" className="route-chip">
              Dashboard
            </Link>
            <Link href="/problems" className="route-chip">
              Problems
            </Link>
            <Link href="/assignments" className="route-chip">
              Assignments
            </Link>
            <Link href="/resources" className="route-chip">
              Resources
            </Link>
            <Link href="/membership" className="route-chip">
              Membership
            </Link>
            <Link href="/admin" className="route-chip">
              Admin
            </Link>
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
    </header>
  );
}
