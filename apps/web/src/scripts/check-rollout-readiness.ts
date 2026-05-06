import { prisma } from "@arcmath/db";
import { getRealTutorRolloutEntries } from "@/lib/real-tutor-rollout";

async function main() {
  const sets = await prisma.problemSet.findMany({
    select: {
      contest: true,
      year: true,
      exam: true,
      _count: { select: { problems: true } }
    },
    orderBy: [{ contest: "asc" }, { year: "asc" }, { exam: "asc" }]
  });

  // Quick reconciliation: warn on every "live" rollout entry that has no
  // matching set in the DB so the catalog never points at a phantom row.
  const liveEntries = getRealTutorRolloutEntries("live");
  for (const entry of liveEntries) {
    const found = sets.find(
      (s) => s.contest === entry.contest && s.year === entry.year && (s.exam ?? null) === (entry.exam ?? null)
    );
    if (!found) {
      console.warn(`!! LIVE rollout entry has no DB row: ${entry.contest} ${entry.year} ${entry.exam ?? "-"}`);
    }
  }

  // Bucket by status of problems with statements + (mc choices OR integer answer OR worked solution)
  for (const s of sets) {
    const detailed = await prisma.problem.findMany({
      where: {
        problemSet: { contest: s.contest, year: s.year, exam: s.exam }
      },
      select: {
        id: true,
        statement: true,
        answerFormat: true,
        answer: true,
        choices: true,
        solutionSketch: true
      }
    });

    const total = detailed.length;
    const hasStatement = detailed.filter((p) => p.statement && p.statement.length > 30).length;
    const hasAnswer = detailed.filter((p) => {
      if (p.answerFormat === "WORKED_SOLUTION") return p.solutionSketch && p.solutionSketch.length > 30;
      return p.answer !== null && p.answer !== undefined && String(p.answer).length > 0;
    }).length;
    const hasChoices = detailed.filter((p) => {
      if (p.answerFormat !== "MULTIPLE_CHOICE") return true;
      const choices = p.choices as unknown;
      if (Array.isArray(choices)) return choices.length >= 4;
      if (choices && typeof choices === "object") return Object.keys(choices).length >= 4;
      return false;
    }).length;

    console.log(
      `${s.contest.padEnd(8)} ${s.year} ${(s.exam ?? "-").padEnd(3)} | total=${total.toString().padStart(3)} | stmt=${hasStatement.toString().padStart(3)} | ans=${hasAnswer.toString().padStart(3)} | choicesOK=${hasChoices.toString().padStart(3)}`
    );
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
