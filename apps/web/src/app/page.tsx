import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = Boolean(session?.user);

  return (
    <main className="motion-rise space-y-8">
      <section className="surface-card relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-12 h-40 w-40 rounded-full bg-[rgba(246,192,122,0.45)] blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-52 w-52 rounded-full bg-[rgba(47,122,109,0.25)] blur-3xl" />
        <div className="relative grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <span className="badge">ArcMath MVP-0</span>
            <h1 className="mt-4 text-4xl font-semibold text-slate-900 md:text-5xl">
              Modern math practice, built for focus.
            </h1>
            <p className="mt-4 text-base text-slate-600">
              ArcMath keeps contests, assignments, and analytics organized in one calm workspace. The foundation is
              ready for teachers and students to move fast without the clutter.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {isLoggedIn ? (
                <>
                  <Link className="btn-primary" href="/dashboard">
                    Open Dashboard
                  </Link>
                  <Link className="btn-secondary" href="/problems">
                    Browse Problems
                  </Link>
                </>
              ) : (
                <>
                  <Link className="btn-primary" href="/register">
                    Create Account
                  </Link>
                  <Link className="btn-secondary" href="/login">
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stack</p>
              <p className="mt-2 text-sm text-slate-700">
                Email/password auth, RBAC middleware, Prisma/Postgres, and tRPC health checks.
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
              <p className="mt-2 text-sm text-slate-700">
                {isLoggedIn
                  ? `Signed in as ${session?.user?.email ?? "user"} (${session?.user?.role ?? "role"}).`
                  : "Sign in to personalize dashboards and assignments."}
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next Up</p>
              <p className="mt-2 text-sm text-slate-700">
                Import contest data, publish assignments, and track student progress from a single view.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="surface-card space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Problem Library</h2>
          <p className="text-sm text-slate-600">Filter AMC/AIME sets, scan previews, and assemble practice lists fast.</p>
        </div>
        <div className="surface-card space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Assignments</h2>
          <p className="text-sm text-slate-600">
            Schedule targeted practice, assign difficulty bands, and share links in minutes.
          </p>
        </div>
        <div className="surface-card space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Insights</h2>
          <p className="text-sm text-slate-600">Track completion, spot trends, and keep students moving steadily.</p>
        </div>
      </section>

      {isLoggedIn ? (
        <section className="surface-card">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Jump Back In</h2>
          <div className="flex flex-wrap gap-3">
            <Link className="btn-primary" href="/dashboard">
              Open Dashboard
            </Link>
            <Link className="btn-secondary" href="/problems">
              Problems
            </Link>
            <Link className="btn-secondary" href="/assignments">
              Assignments
            </Link>
            <Link className="btn-secondary" href="/resources">
              Resources
            </Link>
            <Link className="btn-secondary" href="/admin">
              Admin
            </Link>
          </div>
        </section>
      ) : (
        <section className="surface-card">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Get Started</h2>
          <p className="mb-4 text-sm text-slate-600">Create a student account or sign in to continue.</p>
          <div className="flex flex-wrap gap-3">
            <Link className="btn-primary" href="/register">
              Create Account
            </Link>
            <Link className="btn-secondary" href="/login">
              Sign In
            </Link>
          </div>
        </section>
      )}

      <section className="surface-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Current Session</h2>
            <p className="mt-2 text-sm text-slate-600">
              Authentication context as seen by the server.
            </p>
          </div>
          <span className="badge">Auth</span>
        </div>
        <pre className="code-block mt-4 overflow-auto">
          {JSON.stringify(session?.user ?? null, null, 2)}
        </pre>
      </section>
    </main>
  );
}
