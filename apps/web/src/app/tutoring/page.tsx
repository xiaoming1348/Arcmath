import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { userCanAccessRealTutorProblemSet } from "@/lib/tutor-premium-access";
import { buildRealTutorUsableProblemSetWhere } from "@/lib/tutor-usable-sets";

export default async function TutoringPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=%2Ftutoring");
  }

  const firstRealSet = await prisma.problemSet.findFirst({
    where: buildRealTutorUsableProblemSetWhere(),
    select: { id: true },
    orderBy: [{ year: "asc" }, { exam: "asc" }]
  });

  const hasAccess =
    session.user.role === "ADMIN" ||
    (firstRealSet
      ? await userCanAccessRealTutorProblemSet({
          prisma,
          user: session.user,
          problemSetId: firstRealSet.id
        })
      : false);

  if (!hasAccess) {
    redirect("/membership?callbackUrl=%2Ftutoring");
  }

  return (
    <main className="motion-rise mx-auto max-w-4xl space-y-4">
      <section className="surface-card space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-secondary))] text-3xl font-bold text-white shadow-[0_20px_36px_rgba(30,102,245,0.28)]">
            TM
          </div>
          <div className="space-y-1">
            <span className="badge">Small-Group / 1v1 Coaching</span>
            <h1 className="text-2xl font-semibold text-slate-900">Tutor Mira</h1>
            <p className="text-sm text-slate-600">
              A placeholder tutoring surface for future live instruction based on each student&apos;s weak topics and recent diagnostic report.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">How coaching will work</h2>
          <ul className="space-y-2 text-sm text-slate-700">
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Group students by target exam and weakest topic clusters</li>
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Walk through the ideas they missed in diagnostics and real-set practice</li>
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Assign the next batch of real contest problems after instruction</li>
          </ul>
        </div>

        <div className="surface-card space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Demo actions</h2>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Booking and payment are not wired yet. This page is the current placeholder for the future tutoring workflow.
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/reports" className="btn-secondary">
              Review Latest Report
            </Link>
            <Link href="/problems" className="btn-primary">
              Practice Real Sets
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
