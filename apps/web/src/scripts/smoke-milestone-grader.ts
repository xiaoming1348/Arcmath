/**
 * Smoke test for the milestone-aware proof grader (Phase D).
 *
 * Picks one PROOF problem with a stored structured-solution recipe and
 * feeds three synthetic student submissions through generateProofReview:
 *   A) Full correct proof — matching the recipe's technique
 *   B) Valid alternative approach — expects REPLACED on affected milestones
 *   C) Wrong proof — expects INVALID or MISSING
 *
 * Run via:
 *   bash scripts/with-env-local.sh node --import tsx \
 *     apps/web/src/scripts/smoke-milestone-grader.ts [<problemId>]
 *
 * No writes to the DB. Output is human-readable; check that the grader
 * actually differentiates between the three submissions' milestone
 * coverage. This is the MVP proof-of-life that the Phase D pipeline
 * produces accurate diverse-answer grading.
 */
import { prisma } from "@arcmath/db";
import { generateProofReview } from "../lib/ai/proof-tutor";
import { isStructuredSolution, type StructuredSolution } from "../lib/ai/solution-generator";

// Default to PRACTICE-1 #1 (SOS inequality). Simple, VERIFIED, recipe
// has 3 clean milestones — an ideal unit test bed.
const DEFAULT_PROBLEM_ID = "cmo6h94ze0002m5dlblr01cyt";

// Fabricated student submissions for the SOS inequality problem.
// Each is a list of steps mirroring what proof-step extraction would
// produce from a student's LaTeX answer. We set verdict=PLAUSIBLE
// (LLM_JUDGE backend) for all steps to simulate the typical student
// flow: no Lean verification happened per-step; the grader relies on
// the recipe to score coverage.
type FabricatedStep = { index: number; latex: string };

function toGraderSteps(steps: FabricatedStep[]) {
  return steps.map((s) => ({
    index: s.index,
    latex: s.latex,
    stepType: "DEDUCTION" as const,
    verdict: "PLAUSIBLE" as const,
    verificationBackend: "LLM_JUDGE" as const
  }));
}

// ---- Submission A: full correct SOS proof matching the recipe. ----
const SUBMISSION_A_FULL_SOS: FabricatedStep[] = [
  { index: 0, latex: "a^2 + b^2 + c^2 - ab - bc - ca = \\frac{1}{2}\\left((a-b)^2 + (b-c)^2 + (c-a)^2\\right)" },
  { index: 1, latex: "(a-b)^2 \\geq 0,\\ (b-c)^2 \\geq 0,\\ (c-a)^2 \\geq 0" },
  { index: 2, latex: "\\text{Therefore } (a-b)^2 + (b-c)^2 + (c-a)^2 \\geq 0" },
  { index: 3, latex: "\\text{Hence } a^2 + b^2 + c^2 - ab - bc - ca \\geq 0, \\text{ i.e. } a^2 + b^2 + c^2 \\geq ab + bc + ca" }
];

// ---- Submission B: valid alternative — pairwise AM-GM. ----
// For each pair: a^2 + b^2 >= 2ab. Sum three such inequalities.
// Equivalent to the SOS proof but the technique tag will differ;
// milestone 2 (SOS factoring) should be REPLACED, not ESTABLISHED.
const SUBMISSION_B_ALT_AMGM: FabricatedStep[] = [
  { index: 0, latex: "(a-b)^2 \\geq 0 \\implies a^2 + b^2 \\geq 2ab" },
  { index: 1, latex: "\\text{Similarly } b^2 + c^2 \\geq 2bc \\text{ and } c^2 + a^2 \\geq 2ca" },
  { index: 2, latex: "\\text{Adding: } 2(a^2+b^2+c^2) \\geq 2(ab+bc+ca)" },
  { index: 3, latex: "\\text{Dividing by 2: } a^2+b^2+c^2 \\geq ab+bc+ca" }
];

// ---- Submission C: WRONG — pairwise claim a^2 >= ab is false. ----
// This is a common student mistake: assuming a^2 >= ab without the
// hypothesis a >= b >= 0. e.g. a=1, b=2 gives 1 < 2.
const SUBMISSION_C_WRONG: FabricatedStep[] = [
  { index: 0, latex: "a^2 \\geq ab \\text{ (by dividing both sides by } a \\text{)}" },
  { index: 1, latex: "b^2 \\geq bc, \\quad c^2 \\geq ca \\text{ by similar argument}" },
  { index: 2, latex: "\\text{Adding: } a^2 + b^2 + c^2 \\geq ab + bc + ca" }
];

async function main() {
  const argProblemId = process.argv[2];
  const problemId = argProblemId && argProblemId.length > 0 ? argProblemId : DEFAULT_PROBLEM_ID;

  const row = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      statement: true,
      milestoneChecks: true,
      problemSet: { select: { contest: true, year: true } }
    }
  });
  if (!row) {
    console.error(`Problem ${problemId} not found.`);
    process.exit(1);
  }
  if (!row.statement) {
    console.error(`Problem ${problemId} has no statement.`);
    process.exit(1);
  }

  const recipe: StructuredSolution | null = isStructuredSolution(row.milestoneChecks)
    ? (row.milestoneChecks as StructuredSolution)
    : null;

  if (!recipe) {
    console.error(
      `Problem ${problemId} has no stored structured-solution recipe. Run preprocess:problems -- --solution-only first.`
    );
    process.exit(1);
  }

  console.log(`Problem: ${row.problemSet.contest} ${row.problemSet.year} [${row.id}]`);
  console.log(`Statement: ${row.statement}`);
  console.log(`Recipe milestones (${recipe.steps.length}):`);
  for (const s of recipe.steps) {
    console.log(`  #${s.index} ${s.title} [${s.technique.join("/")}]`);
  }

  const cases: Array<{ label: string; steps: FabricatedStep[]; expectedShape: string }> = [
    {
      label: "A. Full correct SOS",
      steps: SUBMISSION_A_FULL_SOS,
      expectedShape: "All milestones ESTABLISHED; overall feedback = correct."
    },
    {
      label: "B. Valid alternative (pairwise AM-GM)",
      steps: SUBMISSION_B_ALT_AMGM,
      expectedShape: "All milestones ESTABLISHED or REPLACED; no INVALID."
    },
    {
      label: "C. Wrong — false claim a² ≥ ab",
      steps: SUBMISSION_C_WRONG,
      expectedShape: "At least one INVALID milestone; overall feedback calls out pitfall."
    }
  ];

  for (const c of cases) {
    console.log("\n================================================");
    console.log(c.label);
    console.log(`Expected: ${c.expectedShape}`);
    console.log("Steps submitted:");
    for (const s of c.steps) console.log(`  ${s.index + 1}. ${s.latex}`);
    console.log("---");
    const review = await generateProofReview({
      problemStatement: row.statement,
      steps: toGraderSteps(c.steps),
      solutionRecipe: recipe
    });
    console.log("overallFeedback:");
    console.log(review.overallFeedback);
    console.log("milestoneCoverage:");
    for (const m of review.milestoneCoverage) {
      console.log(`  #${m.index} ${m.status}: ${m.evidence}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
