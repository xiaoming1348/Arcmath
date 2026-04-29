import { prisma, type Contest } from "@arcmath/db";

const DEMO_PROBLEM_SET = {
  contest: "AIME" as Contest,
  year: 9999,
  exam: "PROOF_DEMO",
  title: "Proof Tutor Demo · Algebra",
  category: "TOPIC_PRACTICE" as const,
  submissionMode: "PER_PROBLEM" as const,
  tutorEnabled: true,
  sourceUrl: "local://seed/proof-demo",
  status: "PUBLISHED" as const
};

const DEMO_PROBLEM = {
  number: 1,
  statement:
    "Let $x$ be a real number satisfying $x + \\dfrac{1}{x} = 3$. " +
    "Find the value of $x^3 + \\dfrac{1}{x^3}$.",
  statementFormat: "MARKDOWN_LATEX" as const,
  answerFormat: "PROOF" as const,
  answer: "18",
  solutionSketch:
    "Expand (x + 1/x)^3 = x^3 + 3x + 3/x + 1/x^3 = (x^3 + 1/x^3) + 3(x + 1/x). " +
    "So x^3 + 1/x^3 = (x + 1/x)^3 - 3(x + 1/x) = 27 - 9 = 18.",
  topicKey: "algebra.identities",
  difficultyBand: "AIME",
  techniqueTags: ["algebra", "cubes", "symmetric_functions"]
};

async function main() {
  const problemSet = await prisma.problemSet.upsert({
    where: {
      contest_year_exam: {
        contest: DEMO_PROBLEM_SET.contest,
        year: DEMO_PROBLEM_SET.year,
        exam: DEMO_PROBLEM_SET.exam
      }
    },
    update: {
      title: DEMO_PROBLEM_SET.title,
      category: DEMO_PROBLEM_SET.category,
      submissionMode: DEMO_PROBLEM_SET.submissionMode,
      tutorEnabled: DEMO_PROBLEM_SET.tutorEnabled,
      sourceUrl: DEMO_PROBLEM_SET.sourceUrl,
      status: DEMO_PROBLEM_SET.status
    },
    create: DEMO_PROBLEM_SET
  });

  const problem = await prisma.problem.upsert({
    where: {
      problemSetId_number: {
        problemSetId: problemSet.id,
        number: DEMO_PROBLEM.number
      }
    },
    update: {
      statement: DEMO_PROBLEM.statement,
      statementFormat: DEMO_PROBLEM.statementFormat,
      answerFormat: DEMO_PROBLEM.answerFormat,
      answer: DEMO_PROBLEM.answer,
      solutionSketch: DEMO_PROBLEM.solutionSketch,
      topicKey: DEMO_PROBLEM.topicKey,
      difficultyBand: DEMO_PROBLEM.difficultyBand,
      techniqueTags: DEMO_PROBLEM.techniqueTags
    },
    create: {
      ...DEMO_PROBLEM,
      problemSetId: problemSet.id
    }
  });

  console.log("Seeded proof demo:");
  console.log("  problemSetId:", problemSet.id);
  console.log("  problemId   :", problem.id);
  console.log("  URL path    : /problems/" + problem.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
