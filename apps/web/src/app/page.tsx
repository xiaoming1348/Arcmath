import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = Boolean(session?.user);

  const heroStats = [
    {
      label: "Practice Flow",
      value: "Guided",
      description: "Move from curated sets to focused problem solving without losing momentum."
    },
    {
      label: "Parent View",
      value: "Clear",
      description: "Assignments and progress are easier to understand at a glance."
    },
    {
      label: "Contest Library",
      value: "Organized",
      description: "AMC and AIME resources stay accessible without making the workspace feel crowded."
    }
  ];

  const featureCards = [
    {
      title: "For Students",
      body: "Settle into longer problem-solving sessions with a layout that stays calm and easy to read."
    },
    {
      title: "For Parents",
      body: "See what was assigned, what was completed, and what to focus on next without digging."
    },
    {
      title: "For Coaches",
      body: "Build and manage practice in a workspace that feels more intentional and easier to navigate."
    }
  ];

  const quickLinks = isLoggedIn
    ? [
        { href: "/dashboard", label: "Open Dashboard" },
        { href: "/problems", label: "Browse Problems" },
        { href: "/assignments", label: "Review Assignments" },
        { href: "/resources", label: "Open Resources" }
      ]
    : [
        { href: "/register", label: "Create Account" },
        { href: "/login", label: "Sign In" }
      ];

  return (
    <main className="motion-rise space-y-6 md:space-y-8">
      <section className="hero-panel">
        <div className="relative grid gap-8 md:grid-cols-[1.15fr_0.85fr] md:items-center">
          <div>
            <span className="kicker">ArcMath Learning Workspace</span>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-white md:text-6xl">
              Math practice that keeps students focused and families informed.
            </h1>
            <p className="mt-5 max-w-2xl text-base md:text-lg">
              From contest problems to assignments and reports, ArcMath brings everything into one clear learning
              workspace that feels modern, calm, and easy to trust.
            </p>

            <div className="info-strip mt-6">
              <span className="info-pill border-white/10 bg-white/10 text-blue-50">Structured practice</span>
              <span className="info-pill border-white/10 bg-white/10 text-blue-50">Readable progress tracking</span>
              <span className="info-pill border-white/10 bg-white/10 text-blue-50">Subtle tech aesthetic</span>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {isLoggedIn ? (
                <>
                  <Link className="btn-primary" href="/dashboard">
                    Open Dashboard
                  </Link>
                  <Link className="btn-secondary border-white/20 bg-white/10 text-white hover:bg-white/20" href="/problems">
                    Browse Problems
                  </Link>
                </>
              ) : (
                <>
                  <Link className="btn-primary" href="/register">
                    Create Account
                  </Link>
                  <Link className="btn-secondary border-white/20 bg-white/10 text-white hover:bg-white/20" href="/login">
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-3">
            {heroStats.map((item) => (
              <div key={item.label} className="hero-stat">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/70">{item.label}</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">{item.value}</p>
                <p className="mt-2 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-grid">
        {featureCards.map((card, index) => (
          <div key={card.title} className="surface-card relative overflow-hidden space-y-3">
            <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-[rgba(30,102,245,0.08)] blur-3xl" />
            <span className="badge">0{index + 1}</span>
            <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-900">{card.title}</h2>
            <p className="text-sm text-slate-600">{card.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="surface-card space-y-5">
          <div className="space-y-2">
            <span className="kicker">What ArcMath Helps With</span>
            <h2 className="text-3xl font-semibold tracking-[-0.05em] text-slate-900">
              Keep practice structured without making it feel heavy.
            </h2>
            <p className="max-w-2xl text-sm text-slate-600">
              The platform is designed to support steady progress: meaningful practice, visible follow-through, and less
              time spent hunting for the next step.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Assignments</p>
              <p className="mt-3 text-sm text-slate-700">
                Turn large goals into manageable sessions with clear directions and expectations.
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resources</p>
              <p className="mt-3 text-sm text-slate-700">
                Keep official papers, curated sets, and support materials in one organized place.
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Guided Support</p>
              <p className="mt-3 text-sm text-slate-700">
                Help students stay moving when they get stuck instead of losing confidence mid-session.
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Reports</p>
              <p className="mt-3 text-sm text-slate-700">
                Give families and coaches a clearer view of growth, rhythm, and next priorities.
              </p>
            </div>
          </div>
        </div>

        <section className="surface-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="badge">{isLoggedIn ? "Ready to continue" : "Quick start"}</span>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-900">
                {isLoggedIn ? "Jump back into your workflow." : "Start with a clean, simple setup."}
              </h2>
            </div>
            <div className="rounded-full border border-[rgba(16,35,60,0.08)] bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {isLoggedIn ? session?.user?.role ?? "Member" : "Guest"}
            </div>
          </div>

          <p className="text-sm text-slate-600">
            {isLoggedIn
              ? "Your main tools are ready to open whenever you want to continue."
              : "Create a student account or sign in to personalize dashboards, assignments, and reports."}
          </p>

          <div className="flex flex-wrap gap-3">
            {quickLinks.map((link, index) => (
              <Link key={link.href} className={index === 0 ? "btn-primary" : "btn-secondary"} href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
