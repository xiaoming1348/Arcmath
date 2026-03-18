import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { getTutorUsableSetKind, isTutorUsableProblemSet } from "@/lib/tutor-usable-sets";

type PracticeSetPageProps = {
  params: Promise<{
    problemSetId: string;
  }>;
};

export default async function PracticeSetPage({ params }: PracticeSetPageProps) {
  const { problemSetId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/problems/set/${problemSetId}`)}`);
  }

  const practiceSet = await prisma.problemSet.findUnique({
    where: {
      id: problemSetId
    },
    select: {
      id: true,
      title: true,
      contest: true,
      year: true,
      exam: true,
      sourceUrl: true,
      problems: {
        orderBy: {
          number: "asc"
        },
        select: {
          id: true,
          number: true,
          topicKey: true,
          difficultyBand: true
        }
      }
    }
  });

  if (!practiceSet) {
    notFound();
  }

  const tutorUsableSetKind = getTutorUsableSetKind(practiceSet);
  if (!isTutorUsableProblemSet(practiceSet)) {
    notFound();
  }

  const totalProblems = practiceSet.problems.length;
  const firstProblem = practiceSet.problems[0] ?? null;
  const practiceRun = firstProblem
    ? ((await prisma.practiceRun.findFirst({
        where: {
          userId: session.user.id,
          problemSetId: practiceSet.id,
          completedAt: null
        },
        orderBy: {
          startedAt: "desc"
        },
        select: {
          id: true
        }
      })) ??
      (await prisma.practiceRun.create({
        data: {
          userId: session.user.id,
          problemSetId: practiceSet.id
        },
        select: {
          id: true
        }
      })))
    : null;

  function buildProblemHref(problemId: string): string {
    const basePath = `/problems/${encodeURIComponent(problemId)}`;
    return practiceRun ? `${basePath}?runId=${encodeURIComponent(practiceRun.id)}` : basePath;
  }

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <span className="badge">Hint Tutor Practice</span>
            <h1 className="text-2xl font-semibold text-slate-900">{practiceSet.title}</h1>
            <p className="text-sm text-slate-600">
              {practiceSet.contest} {practiceSet.year}
              {practiceSet.exam ? ` ${practiceSet.exam}` : ""}
            </p>
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>
                {totalProblems} problem{totalProblems === 1 ? "" : "s"}
              </span>
              <span className="badge">{tutorUsableSetKind === "real" ? "Real contest set" : "Seeded practice set"}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {firstProblem ? (
              <Link className="btn-primary" href={buildProblemHref(firstProblem.id)}>
                Start Practice
              </Link>
            ) : null}
            <Link className="btn-secondary" href="/problems">
              Back to Sets
            </Link>
          </div>
        </div>
      </section>

      <section className="surface-card space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Problems in order</h2>
          <p className="text-sm text-slate-600">
            Open any problem to enter the existing Hint Tutor experience and keep one PracticeRun scoped to this set.
          </p>
        </div>

        {totalProblems > 0 ? (
          <div className="space-y-3">
            {practiceSet.problems.map((problem, index) => (
              <article
                key={problem.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
              >
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-slate-900">
                    Problem {problem.number} of {totalProblems}
                  </h3>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Position {index + 1} / {totalProblems}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {problem.topicKey ? <span className="badge">{problem.topicKey}</span> : null}
                    {problem.difficultyBand ? <span className="badge">{problem.difficultyBand}</span> : null}
                  </div>
                </div>

                <Link className="btn-primary" href={buildProblemHref(problem.id)}>
                  Open Tutor
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            This set does not contain any problems yet.
          </div>
        )}
      </section>
    </main>
  );
}
