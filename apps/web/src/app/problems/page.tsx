import Link from "next/link";
import { prisma } from "@arcmath/db";
import { buildTutorUsableProblemSetWhere, getTutorUsableSetKind } from "@/lib/tutor-usable-sets";

export default async function ProblemsPage() {
  const practiceSets = await prisma.problemSet.findMany({
    where: {
      ...buildTutorUsableProblemSetWhere()
    },
    orderBy: [
      {
        year: "desc"
      },
      {
        title: "asc"
      }
    ],
    select: {
      id: true,
      title: true,
      contest: true,
      year: true,
      exam: true,
      sourceUrl: true,
      _count: {
        select: {
          problems: true
        }
      }
    }
  });

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <span className="badge">AI Hint Tutor</span>
        <h1 className="text-2xl font-semibold text-slate-900">Practice Sets</h1>
        <p className="text-sm text-slate-600">
          Start from a tutor-ready practice set and move through problems in order. This includes seeded MVP sets and
          imported real contest sets that are safe for the current tutor flow.
        </p>
      </section>

      <section className="surface-card space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Available sets</h2>
          <p className="text-sm text-slate-600">
            Each set below works with the current Hint Tutor, PracticeRun, and report flow.
          </p>
        </div>

        {practiceSets.length > 0 ? (
          <div className="space-y-3">
            {practiceSets.map((practiceSet) => (
              <article
                key={practiceSet.id}
                className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900">{practiceSet.title}</h3>
                    <p className="text-sm text-slate-600">
                      {practiceSet.contest} {practiceSet.year}
                      {practiceSet.exam ? ` ${practiceSet.exam}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span>{practiceSet._count.problems} problems</span>
                      <span className="badge">
                        {getTutorUsableSetKind(practiceSet) === "real" ? "Real contest set" : "Seeded practice set"}
                      </span>
                    </div>
                  </div>

                  <Link className="btn-primary" href={`/problems/set/${encodeURIComponent(practiceSet.id)}`}>
                    Open Set
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            No tutor-ready practice sets were found yet. Seed local sets or import a tutor-safe real contest set.
          </div>
        )}
      </section>
    </main>
  );
}
