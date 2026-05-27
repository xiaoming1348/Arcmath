import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@arcmath/db";
import {
  buildStudentProgressReport,
  type ProgressAttemptInput
} from "@/lib/ai/student-progress-report";
import { Card, Eyebrow, Metric, Section } from "@/components/ui";
import { TopicMasteryGrid } from "@/components/topic-mastery-grid";

/**
 * /parent/[token] — read-only progress report for a parent.
 *
 * No login required. The token in the URL IS the credential — it was
 * delivered to the parent by email and grants them view-only access
 * to their student's progress until expiresAt.
 *
 * We intentionally show LESS than /me/progress:
 *   - No LLM-generated personalized study plan (it's written for the
 *     student, not the parent — paraphrasing for the parent is a
 *     future thing).
 *   - No recommended next problems (the parent can't act on them).
 *   - No teacher name / contact info (the email already revealed
 *     which org invited them; we don't need to put individual
 *     teacher identities on the page).
 *
 * States the page can render:
 *   - INVALID  : token not found / malformed
 *   - EXPIRED  : invite was created but expiresAt has passed
 *   - REVOKED  : teacher set revokedAt
 *   - OK       : show the report
 *
 * English-only for the MVP. The email is bilingual; the parent who
 * clicks the link is overwhelmingly likely to read enough of either
 * language. Localizing the report adds another locale negotiation
 * (parents don't have a User.locale to read from).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ token: string }>;
};

type InviteState =
  | { kind: "ok" }
  | { kind: "invalid" }
  | { kind: "expired"; expiresAt: Date }
  | { kind: "revoked" };

function ErrorShell({
  title,
  message
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center">
      <Section>
        <Card>
          <Eyebrow>Arcmath</Eyebrow>
          <h1
            className="mt-3 text-2xl font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            {title}
          </h1>
          <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
            {message}
          </p>
        </Card>
      </Section>
    </main>
  );
}

export default async function ParentViewPage({ params }: PageProps) {
  noStore();

  const { token } = await params;

  // Look up the invite. We intentionally do NOT use a unique-key
  // findUnique with throw-on-missing — we want to render a friendly
  // "invalid link" page, not a 404.
  const invite = await prisma.parentInvite.findUnique({
    where: { token },
    select: {
      id: true,
      studentUserId: true,
      organizationId: true,
      relationship: true,
      expiresAt: true,
      consumedAt: true,
      revokedAt: true,
      student: { select: { id: true, name: true, email: true } },
      organization: { select: { name: true } }
    }
  });

  let state: InviteState;
  if (!invite) {
    state = { kind: "invalid" };
  } else if (invite.revokedAt) {
    state = { kind: "revoked" };
  } else if (invite.expiresAt.getTime() < Date.now()) {
    state = { kind: "expired", expiresAt: invite.expiresAt };
  } else {
    state = { kind: "ok" };
  }

  if (state.kind === "invalid") {
    return (
      <ErrorShell
        title="Link not recognized"
        message="This invite link doesn't match any active invite. Double-check the link in the email, or ask the teacher to resend."
      />
    );
  }
  if (state.kind === "expired") {
    return (
      <ErrorShell
        title="Link expired"
        message={`This invite expired on ${state.expiresAt
          .toISOString()
          .slice(
            0,
            10
          )}. Ask the teacher to send a new one — invites are valid for 30 days.`}
      />
    );
  }
  if (state.kind === "revoked") {
    return (
      <ErrorShell
        title="Link revoked"
        message="The teacher revoked this invite. Contact the school if you believe this is a mistake."
      />
    );
  }

  // We have invite + state.kind === "ok". Pull progress and render.
  // Fire-and-forget set consumedAt on first open.
  if (invite && !invite.consumedAt) {
    // Don't await — race conditions in the "first view timestamp" are
    // not worth blocking the page render. If two clicks land at the
    // same millisecond, the later one wins; the difference is < 1s.
    prisma.parentInvite
      .update({
        where: { id: invite.id },
        data: { consumedAt: new Date() }
      })
      .catch(() => {});
  }

  if (!invite) {
    // Type-narrowing safety — state.kind === "ok" implies invite is set,
    // but TS doesn't carry that. Bail to invalid.
    return <ErrorShell title="Link not recognized" message="Please request a fresh invite." />;
  }

  const attemptsRaw = await prisma.problemAttempt.findMany({
    where: { userId: invite.studentUserId, status: "SUBMITTED" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      isCorrect: true,
      hintsUsedCount: true,
      createdAt: true,
      submittedAt: true,
      problem: {
        select: {
          topicKey: true,
          difficultyBand: true,
          problemSet: { select: { contest: true } }
        }
      }
    }
  });

  const attempts: ProgressAttemptInput[] = attemptsRaw.map((a) => ({
    id: a.id,
    isCorrect: a.isCorrect,
    hintsUsedCount: a.hintsUsedCount,
    createdAt: a.createdAt,
    submittedAt: a.submittedAt,
    problem: {
      topicKey: a.problem.topicKey,
      difficultyBand: a.problem.difficultyBand,
      problemSet: { contest: a.problem.problemSet.contest }
    }
  }));

  const report = await buildStudentProgressReport({
    userId: invite.studentUserId,
    attempts,
    locale: "en",
    snapshots: []
  });

  const displayName = invite.student.name ?? invite.student.email ?? "Student";
  const expiresStr = invite.expiresAt.toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <header className="space-y-2">
        <Eyebrow>{invite.organization.name}</Eyebrow>
        <h1
          className="text-3xl md:text-4xl font-semibold tracking-tight"
          style={{ color: "var(--foreground)" }}
        >
          {displayName}&rsquo;s Arcmath progress
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Lifetime view across all practice attempts.
          {invite.relationship
            ? ` Sent to you as ${invite.relationship}.`
            : ""}{" "}
          This link is valid until <strong>{expiresStr}</strong>.
        </p>
      </header>

      <Section>
        {report.totalAttempts === 0 ? (
          <Card>
            <p style={{ color: "var(--muted)" }}>
              {displayName} hasn&rsquo;t completed any practice attempts yet.
              Check back after their next session.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <Metric
                label="Problems attempted"
                value={report.totalAttempts.toLocaleString()}
              />
            </Card>
            <Card>
              <Metric
                label="Accuracy"
                value={`${Math.round(report.lifetimeAccuracy * 100)}%`}
              />
            </Card>
            <Card>
              <Metric
                label="Time spent"
                value={`${Math.round(report.totalTimeSpentMinutes)}m`}
              />
            </Card>
            <Card>
              <Metric
                label="Topics practiced"
                value={String(report.topicMastery.length)}
              />
            </Card>
          </div>
        )}
      </Section>

      {report.totalAttempts > 0 && report.topicMastery.length > 0 ? (
        <Section>
          <h2
            className="text-xl font-semibold mb-4"
            style={{ color: "var(--foreground)" }}
          >
            Topic mastery
          </h2>
          <TopicMasteryGrid
            topics={report.topicMastery}
            labels={{
              levelNames: [
                "Just exploring",
                "Learning",
                "Building",
                "Solid",
                "Strong",
                "Mastered"
              ],
              recommendation: {
                explore: "Try new topics",
                review: "Review",
                progress: "Keep going",
                advance: "Advance"
              },
              legend: "L0 → L5: dotted squares fill as accuracy + consistency improve.",
              empty: "No topics practiced yet."
            }}
          />
        </Section>
      ) : null}

      {report.topStrengths.length > 0 || report.topWeaknesses.length > 0 ? (
        <Section>
          <div className="grid md:grid-cols-2 gap-4">
            {report.topStrengths.length > 0 ? (
              <Card>
                <h3
                  className="text-base font-semibold mb-3"
                  style={{ color: "var(--foreground)" }}
                >
                  Strengths
                </h3>
                <ul className="space-y-2 text-sm" style={{ color: "var(--foreground)" }}>
                  {report.topStrengths.slice(0, 5).map((s) => (
                    <li key={s.topicKey}>
                      {s.label} · {Math.round(s.accuracy * 100)}% across {s.attemptCount} attempts
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {report.topWeaknesses.length > 0 ? (
              <Card>
                <h3
                  className="text-base font-semibold mb-3"
                  style={{ color: "var(--foreground)" }}
                >
                  Topics to work on
                </h3>
                <ul className="space-y-2 text-sm" style={{ color: "var(--foreground)" }}>
                  {report.topWeaknesses.slice(0, 5).map((w) => (
                    <li key={w.topicKey}>
                      {w.label} · {Math.round(w.accuracy * 100)}% across {w.attemptCount} attempts
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        </Section>
      ) : null}

      <footer className="pt-6 pb-2 text-center text-xs" style={{ color: "var(--subtle)" }}>
        Powered by Arcmath · arcscience.forecaster-ai.com
      </footer>
    </main>
  );
}
