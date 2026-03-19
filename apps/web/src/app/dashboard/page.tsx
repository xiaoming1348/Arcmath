import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fdashboard");
  }

  const displayName = session.user.name ?? session.user.email?.split("@")[0] ?? "there";

  return (
    <main className="motion-rise space-y-4 md:space-y-6">
      <section className="hero-panel">
        <div className="relative grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-end">
          <div>
            <span className="kicker">Dashboard</span>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white">
              Welcome back, {displayName}. Keep the momentum going.
            </h1>
            <p className="mt-4 max-w-2xl text-sm md:text-base">
              ArcMath is built to make serious math practice feel more structured and less overwhelming. Everything here
              is designed to help students stay consistent and help families see meaningful progress.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="btn-primary" href="/problems">
                Start Practicing
              </Link>
              <Link className="btn-secondary border-white/20 bg-white/10 text-white hover:bg-white/20" href="/assignments">
                View Assignments
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="hero-stat">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/70">Daily Rhythm</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">Steady</p>
              <p className="mt-2 text-sm">Short, focused sessions build confidence faster than crowded study plans.</p>
            </div>
            <div className="hero-stat">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/70">Long-Term Goal</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">Growth</p>
              <p className="mt-2 text-sm">Better habits, clearer feedback, and stronger problem-solving over time.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="stat-card">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Focused Practice</p>
          <p className="mt-3 text-sm text-slate-700">Choose meaningful work instead of bouncing between disconnected tools.</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Clear Progress</p>
          <p className="mt-3 text-sm text-slate-700">See the next step quickly and keep learning sessions moving with confidence.</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Family Visibility</p>
          <p className="mt-3 text-sm text-slate-700">Parents and coaches can follow along without digging through noise.</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="surface-card space-y-5">
          <div>
            <span className="kicker">Why Students Stay With It</span>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-900">
              Serious learning feels better when the path is clear.
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-600">
              ArcMath is meant to reduce friction around good study habits. Instead of wondering what to do next,
              students can move straight into practice, and families can see how that work is building over time.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Practice With Intent</p>
              <p className="mt-3 text-sm text-slate-700">
                Build confidence through curated problem sets rather than random question hunting.
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Stay On Track</p>
              <p className="mt-3 text-sm text-slate-700">
                Assignments and resources stay close together so the next action is always obvious.
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Use Help Wisely</p>
              <p className="mt-3 text-sm text-slate-700">
                Guided support encourages persistence instead of handing over answers too quickly.
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">See Real Progress</p>
              <p className="mt-3 text-sm text-slate-700">
                Reports and review pages make improvement feel visible, not abstract.
              </p>
            </div>
          </div>
        </div>

        <section className="surface-card space-y-4">
          <div>
            <span className="badge">Start Here</span>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-900">Choose your next move</h2>
            <p className="mt-2 text-sm text-slate-600">
              Whether today is for fresh practice, review, or planning, the main areas are ready to open.
            </p>
          </div>

          <div className="grid gap-3">
            <Link className="stat-card transition hover:-translate-y-0.5" href="/problems">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Problems</p>
              <p className="mt-2 text-base font-semibold text-slate-900">Explore curated contest practice</p>
              <p className="mt-2 text-sm text-slate-600">Browse sets, start a session, and keep your solving rhythm strong.</p>
            </Link>
            <Link className="stat-card transition hover:-translate-y-0.5" href="/assignments">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Assignments</p>
              <p className="mt-2 text-base font-semibold text-slate-900">Review what matters next</p>
              <p className="mt-2 text-sm text-slate-600">See current work, follow priorities, and stay organized week by week.</p>
            </Link>
            <Link className="stat-card transition hover:-translate-y-0.5" href="/reports">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Reports</p>
              <p className="mt-2 text-base font-semibold text-slate-900">Track learning with more clarity</p>
              <p className="mt-2 text-sm text-slate-600">Turn effort into something visible for students, parents, and coaches.</p>
            </Link>
            <Link className="stat-card transition hover:-translate-y-0.5" href="/resources">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resources</p>
              <p className="mt-2 text-base font-semibold text-slate-900">Keep study materials in reach</p>
              <p className="mt-2 text-sm text-slate-600">Open papers, references, and supporting content from one place.</p>
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
