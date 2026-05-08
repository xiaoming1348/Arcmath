/**
 * Seed demo problems for the unified practice workspace:
 *  - An INTEGER (AIME-style) problem for testing ANSWER_ONLY / STUCK_WITH_WORK / HINT_GUIDED flows
 *  - The existing PROOF problem is kept as-is
 *
 * Uses the existing "Proof Tutor Demo · Algebra" problem set
 * (TOPIC_PRACTICE + PER_PROBLEM + tutorEnabled) so both problems live together.
 */

import { prisma, type Contest } from "@arcmath/db";

const DEMO_SET = {
  contest: "AIME" as Contest,
  year: 9999,
  exam: "PROOF_DEMO"
};

async function main() {
  const problemSet = await prisma.problemSet.findUnique({
    where: {
      contest_year_exam: {
        contest: DEMO_SET.contest,
        year: DEMO_SET.year,
        exam: DEMO_SET.exam
      }
    },
    select: { id: true }
  });

  if (!problemSet) {
    throw new Error("Proof demo set not found. Run seed-proof-demo.ts first.");
  }

  const integerProblem = await prisma.problem.upsert({
    where: { problemSetId_number: { problemSetId: problemSet.id, number: 2 } },
    update: {
      statement:
        "Let $x$ be a real number satisfying $x + \\dfrac{1}{x} = 3$. " +
        "Find the value of $x^3 + \\dfrac{1}{x^3}$.",
      statementFormat: "MARKDOWN_LATEX",
      answerFormat: "INTEGER",
      answer: "18",
      solutionSketch:
        "Cube the relation: (x + 1/x)^3 = x^3 + 3x + 3/x + 1/x^3 = (x^3 + 1/x^3) + 3(x + 1/x) = (x^3 + 1/x^3) + 9. Given (x + 1/x)^3 = 27, x^3 + 1/x^3 = 27 - 9 = 18.",
      topicKey: "algebra.identities",
      difficultyBand: "AIME",
      techniqueTags: ["algebra", "cubes", "symmetric_functions"],
      curatedHintLevel1: "Cubing $x + 1/x$ is usually the right move here.",
      curatedHintLevel2:
        "Expand $(x + 1/x)^3$ fully — notice that the middle terms $3x$ and $3/x$ group as $3(x + 1/x)$.",
      curatedHintLevel3:
        "Write $x^3 + 1/x^3 = (x + 1/x)^3 - 3(x + 1/x)$ and substitute the given value."
    },
    create: {
      problemSetId: problemSet.id,
      number: 2,
      statement:
        "Let $x$ be a real number satisfying $x + \\dfrac{1}{x} = 3$. " +
        "Find the value of $x^3 + \\dfrac{1}{x^3}$.",
      statementFormat: "MARKDOWN_LATEX",
      answerFormat: "INTEGER",
      answer: "18",
      solutionSketch:
        "Cube the relation: (x + 1/x)^3 = x^3 + 3x + 3/x + 1/x^3 = (x^3 + 1/x^3) + 3(x + 1/x) = (x^3 + 1/x^3) + 9. Given (x + 1/x)^3 = 27, x^3 + 1/x^3 = 27 - 9 = 18.",
      topicKey: "algebra.identities",
      difficultyBand: "AIME",
      techniqueTags: ["algebra", "cubes", "symmetric_functions"],
      curatedHintLevel1: "Cubing $x + 1/x$ is usually the right move here.",
      curatedHintLevel2:
        "Expand $(x + 1/x)^3$ fully — notice that the middle terms $3x$ and $3/x$ group as $3(x + 1/x)$.",
      curatedHintLevel3:
        "Write $x^3 + 1/x^3 = (x + 1/x)^3 - 3(x + 1/x)$ and substitute the given value."
    }
  });

  console.log("Integer demo problem:", integerProblem.id);
  console.log("  URL path: /problems/" + integerProblem.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
