import Link from "next/link";
import { getServerSession } from "next-auth";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { listGrantedRealTutorProblemSetIds } from "@/lib/tutor-premium-access";
import {
  buildDiagnosticProblemSetWhere,
  buildRealExamProblemSetWhere,
  buildTopicPracticeProblemSetWhere
} from "@/lib/tutor-usable-sets";
import { getDiagnosticStageLabel } from "@/lib/problem-set-modes";

export default async function ProblemsPage() {
  const session = await getServerSession(authOptions);

  const [rawDiagnosticSets, realSets, topicPracticeSets, grantedRealSetIds] = await Promise.all([
    prisma.problemSet.findMany({
      where: buildDiagnosticProblemSetWhere(),
      orderBy: [{ year: "desc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        contest: true,
        category: true,
        diagnosticStage: true,
        submissionMode: true,
        _count: {
          select: {
            problems: true
          }
        }
      }
    }),
    prisma.problemSet.findMany({
      where: buildRealExamProblemSetWhere(),
      orderBy: [{ contest: "asc" }, { year: "asc" }, { exam: "asc" }],
      select: {
        id: true,
        title: true,
        contest: true,
        year: true,
        exam: true,
        category: true,
        submissionMode: true,
        _count: {
          select: {
            problems: true
          }
        }
      }
    }),
    prisma.problemSet.findMany({
      where: buildTopicPracticeProblemSetWhere(),
      orderBy: [{ contest: "asc" }, { year: "asc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        contest: true,
        year: true,
        exam: true,
        _count: {
          select: {
            problems: true
          }
        }
      }
    }),
    session?.user
      ? listGrantedRealTutorProblemSetIds(prisma, session.user.id)
      : Promise.resolve([])
  ]);

  const grantedIdSet = new Set(grantedRealSetIds);
  const premiumUnlocked = session?.user?.role === "ADMIN" || grantedIdSet.size > 0;
  const diagnosticSets = Array.from(
    new Map(
      rawDiagnosticSets.map((set) => [
        `${set.contest}:${set.title}:${set.diagnosticStage ?? "NONE"}`,
        set
      ])
    ).values()
  );

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <span className="badge">AI Tutor</span>
        <h1 className="text-2xl font-semibold text-slate-900">Practice</h1>
        <p className="text-sm text-slate-600">
          Start with a free diagnostic test. Premium access unlocks the reviewed real contest sets.
        </p>
      </section>

      <section className="surface-card space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Free Diagnostic Tests</h2>
          <p className="text-sm text-slate-600">These are whole-test placements. Submit once at the end to generate a report and track progress over time.</p>
        </div>

        <div className="space-y-3">
          {diagnosticSets.map((practiceSet) => (
            <article key={practiceSet.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900">{practiceSet.title}</h3>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span>{practiceSet._count.problems} problems</span>
                      <span className="badge">Diagnostic test</span>
                      {practiceSet.diagnosticStage ? (
                        <span>{getDiagnosticStageLabel(practiceSet.diagnosticStage)}</span>
                      ) : null}
                    </div>
                  </div>

                <Link className="btn-primary" href={`/problems/set/${encodeURIComponent(practiceSet.id)}`}>
                  Start Test
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      {topicPracticeSets.length > 0 ? (
        <section className="surface-card space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">Topic Practice Sets</h2>
            <p className="text-sm text-slate-600">
              These sets are designed for focused work on a single topic family and use the interactive tutor flow problem-by-problem.
            </p>
          </div>

          <div className="space-y-3">
            {topicPracticeSets.map((set) => (
              <article key={set.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900">{set.title}</h3>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span>{set._count.problems} problems</span>
                      <span className="badge">Topic practice</span>
                    </div>
                  </div>

                  <Link className="btn-primary" href={`/problems/set/${encodeURIComponent(set.id)}`}>
                    Open Set
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="surface-card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">Premium Real Contest Sets</h2>
            <p className="text-sm text-slate-600">
              These reviewed AMC and AIME sets use whole-set exam mode. Access is gated behind the current demo membership unlock.
            </p>
          </div>
          <Link href="/membership?callbackUrl=%2Fproblems" className="btn-secondary">
            {premiumUnlocked ? "Manage Access" : "Unlock Premium"}
          </Link>
        </div>

        <div className="space-y-3">
          {realSets.map((set) => {
            const unlocked = premiumUnlocked || grantedIdSet.has(set.id);

            return (
              <article key={set.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900">{set.title}</h3>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span>{set.contest} {set.year}{set.exam ? ` ${set.exam}` : ""}</span>
                      <span>{set._count.problems} problems</span>
                      <span className="badge">{unlocked ? "Unlocked" : "Premium"}</span>
                    </div>
                  </div>

                  {unlocked ? (
                    <Link className="btn-primary" href={`/problems/set/${encodeURIComponent(set.id)}`}>
                      Open Set
                    </Link>
                  ) : (
                    <Link
                      className="btn-secondary"
                      href={`/membership?callbackUrl=${encodeURIComponent(`/problems/set/${set.id}`)}`}
                    >
                      Unlock to Access
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
