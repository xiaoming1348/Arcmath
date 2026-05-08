/**
 * Benchmark harness for the milestone-aware proof grader.
 *
 * For each of 8 benchmark PROOF problems, feeds TWO synthetic student
 * submissions through generateProofReview:
 *   - CORRECT: a clean proof matching (or validly replacing) the recipe
 *   - WRONG:   a common student error — wrong claim or missing step
 *
 * The script reports, for each (problem, submission) pair, the milestone
 * coverage histogram (counts of ESTABLISHED / REPLACED / PARTIAL /
 * MISSING / INVALID) plus a final accuracy summary:
 *
 *   CORRECT accuracy  = fraction of correct submissions where every
 *                       milestone is ESTABLISHED or REPLACED (no INVALID,
 *                       and at most 1 PARTIAL/MISSING allowed).
 *   WRONG detection   = fraction of wrong submissions where >= 1
 *                       milestone is INVALID (grader flagged the mistake).
 *
 * Usage:
 *   bash scripts/with-env-local.sh pnpm --filter web exec tsx \
 *     src/scripts/benchmark-grader.ts
 *
 * Run-time: ~8 problems * 2 submissions * 5-10s = 2-3 minutes.
 * No DB writes; API costs ~$0.20-0.40 at gpt-4.1-mini rates.
 *
 * Current target (2026-04-21, proof-overall-review-v4 grader):
 *   CORRECT accuracy >= 85% (pass when E+R+P >= N-1 AND 0 INVALID)
 *   WRONG  detection >= 70% (pass when >= 1 INVALID flagged)
 *
 * Known-hard cases where the grader struggles:
 *  - "Right answer, wrong reasoning": student lands on the true
 *    conclusion via invalid logic. Grader can't distinguish from
 *    a terse-but-valid proof without deeper semantic analysis.
 *    (See IMO 1979 P1 wrong.)
 *  - Over-decomposed recipes (> 6 milestones for a short proof):
 *    correct student solutions miss ~2 milestones that the LLM
 *    bundled into one step. Fix is on the recipe-generation side,
 *    not the grader. (See USAJMO 2011 P1 correct.)
 *  - LLM run-to-run noise: the same submission can drift between
 *    INVALID and MISSING classifications across runs. We haven't
 *    chased this with lower-temperature or consensus sampling yet.
 */
import { prisma } from "@arcmath/db";
import {
  generateProofReview,
  type MilestoneCoverage,
  type MilestoneCoverageStatus
} from "../lib/ai/proof-tutor";
import { isStructuredSolution, type StructuredSolution } from "../lib/ai/solution-generator";

type BenchmarkCase = {
  key: string;
  contest: string; // for display
  problemId: string;
  // The fabricated submissions. `expectAllCovered` for CORRECT means we
  // expect every milestone to be ESTABLISHED/REPLACED (no INVALID, <=1
  // PARTIAL/MISSING tolerated). `expectInvalid` for WRONG means we expect
  // at least one INVALID coverage marker.
  correct: string[];
  wrong: string[];
};

// --- Problem IDs (from most-recent seed run, 2026-04-21) ---
// These were produced by `proof:seed-olympiad` and then `preprocess:problems
// --solution-only`; if you re-seed into a fresh DB, update these IDs.
const BENCHMARK: BenchmarkCase[] = [
  {
    key: "usamo-1974-p2",
    contest: "USAMO 1974 P2",
    problemId: "cmo8qdnk3000ky99yr6idjgr8",
    correct: [
      "\\text{Take logarithms: the inequality } a^a b^b c^c \\geq (abc)^{(a+b+c)/3} \\text{ is equivalent to } a \\ln a + b \\ln b + c \\ln c \\geq \\tfrac{a+b+c}{3}(\\ln a + \\ln b + \\ln c).",
      "\\text{Multiply both sides by 3: } 3(a\\ln a + b\\ln b + c\\ln c) \\geq (a+b+c)(\\ln a + \\ln b + \\ln c).",
      "\\text{WLOG } a \\leq b \\leq c. \\text{ Since } \\ln x \\text{ is monotone increasing, } \\ln a \\leq \\ln b \\leq \\ln c.",
      "\\text{By Chebyshev's sum inequality for two similarly-sorted sequences, } 3\\sum a\\ln a \\geq (\\sum a)(\\sum \\ln a).",
      "\\text{Exponentiating both sides of } a\\ln a + b\\ln b + c\\ln c \\geq \\tfrac{a+b+c}{3}\\sum \\ln a \\text{ yields } a^a b^b c^c \\geq (abc)^{(a+b+c)/3}. \\blacksquare"
    ],
    wrong: [
      "\\text{By AM-GM, } a + b + c \\geq 3\\sqrt[3]{abc}.",
      "\\text{Therefore } a^a b^b c^c \\geq (\\sqrt[3]{abc})^{a+b+c} = (abc)^{(a+b+c)/3}. \\blacksquare"
    ]
  },
  {
    key: "imo-1964-p2",
    contest: "IMO 1964 P2",
    problemId: "cmo8qdou7000ny99yxyllz7io",
    correct: [
      "\\text{Apply Ravi's substitution: since } a, b, c \\text{ are sides of a triangle, write } a = y+z,\\ b = z+x,\\ c = x+y \\text{ with } x, y, z > 0.",
      "\\text{Then } b+c-a = 2x,\\ c+a-b = 2y,\\ a+b-c = 2z.",
      "\\text{Substituting, LHS} = 2x(y+z)^2 + 2y(z+x)^2 + 2z(x+y)^2.",
      "\\text{Compute } 3abc - \\text{LHS} = 3(y+z)(z+x)(x+y) - 2[x(y+z)^2 + y(z+x)^2 + z(x+y)^2].",
      "\\text{After expansion, } 3abc - \\text{LHS} = 2xyz + \\text{[nonnegative SOS terms]} \\geq 0.",
      "\\text{Therefore } a^2(b+c-a) + b^2(c+a-b) + c^2(a+b-c) \\leq 3abc, \\text{ with equality iff } x=y=z,\\ \\text{i.e. } a=b=c. \\blacksquare"
    ],
    wrong: [
      "\\text{Expand the LHS: } a^2(b+c-a) + b^2(c+a-b) + c^2(a+b-c) = a^2 b + a^2 c + b^2 a + b^2 c + c^2 a + c^2 b - a^3 - b^3 - c^3.",
      "\\text{By AM-GM, } a^2 b + a^2 c + b^2 a + b^2 c + c^2 a + c^2 b \\geq 6abc.",
      "\\text{So LHS} \\geq 6abc - (a^3+b^3+c^3) \\geq 6abc - 3abc = 3abc \\text{ (using } a^3+b^3+c^3 \\geq 3abc\\text{).}",
      "\\text{Hence LHS} \\geq 3abc, \\text{ done.} \\blacksquare"
    ]
  },
  {
    key: "imo-1979-p1",
    contest: "IMO 1979 P1",
    problemId: "cmo8qdptx000qy99yg05kvbb8",
    correct: [
      "\\text{Write the alternating sum: } S = \\sum_{k=1}^{1319} \\frac{1}{k} - 2\\sum_{k=1}^{659} \\frac{1}{2k} = \\sum_{k=1}^{1319} \\frac{1}{k} - \\sum_{k=1}^{659} \\frac{1}{k}.",
      "\\text{This simplifies to } S = \\sum_{k=660}^{1319} \\frac{1}{k}.",
      "\\text{Pair term } k \\text{ with } 1979-k \\text{ for } 660 \\leq k \\leq 989:\\ \\frac{1}{k} + \\frac{1}{1979-k} = \\frac{1979}{k(1979-k)}.",
      "\\text{Thus } S = 1979 \\cdot \\sum_{k=660}^{989} \\frac{1}{k(1979-k)}.",
      "\\text{Since 1979 is prime and for every } k \\in [660, 989] \\text{ both } k < 1979 \\text{ and } 1979-k < 1979, \\text{ neither } k \\text{ nor } 1979-k \\text{ is divisible by 1979.}",
      "\\text{Hence 1979 divides the numerator } p \\text{ of the reduced fraction } p/q = S. \\blacksquare"
    ],
    wrong: [
      "\\text{Since the alternating sum has 1319 terms and 1979 is an odd prime, the common denominator } q = \\text{lcm}(1, 2, \\ldots, 1319) \\text{ is not divisible by 1979.}",
      "\\text{Therefore } 1979 \\text{ must divide } p \\text{ because the sum } \\frac{p}{q} \\text{ is a fraction and 1979 must divide either } p \\text{ or } q. \\blacksquare"
    ]
  },
  {
    key: "usamo-2000-p1",
    contest: "USAMO 2000 P1",
    problemId: "cmo8qdqzr000ty99yyphmpf9w",
    correct: [
      "\\text{Set } x = m - \\varepsilon,\\ y = m + \\varepsilon \\text{ in the definition: } \\frac{f(m-\\varepsilon) + f(m+\\varepsilon)}{2} \\geq f(m) + 2\\varepsilon.",
      "\\text{Define } D(m, \\varepsilon) = \\frac{f(m-\\varepsilon) + f(m+\\varepsilon)}{2} - f(m);\\ \\text{ so } D(m, \\varepsilon) \\geq 2\\varepsilon.",
      "\\text{Apply the same inequality at } m - \\varepsilon/2 \\text{ and } m + \\varepsilon/2 \\text{ inside the averages: iteratively, } D(m, \\varepsilon) \\geq 2\\varepsilon + D(m, \\varepsilon/2).",
      "\\text{Iterating } N \\text{ times: } D(m, \\varepsilon) \\geq 2\\varepsilon + 2\\varepsilon + \\ldots + 2\\varepsilon + D(m, \\varepsilon/2^N) \\geq 2\\varepsilon N.",
      "\\text{Since } 2\\varepsilon N \\to \\infty \\text{ but } D(m, \\varepsilon) \\text{ is a fixed real number, contradiction.}",
      "\\text{Hence no very convex } f \\text{ exists.} \\blacksquare"
    ],
    wrong: [
      "\\text{Take } f(x) = x^2, \\text{ which is convex.}",
      "\\text{Check: } \\frac{f(x) + f(y)}{2} = \\frac{x^2+y^2}{2} \\text{ and } f((x+y)/2) = \\frac{(x+y)^2}{4}.",
      "\\text{Difference: } \\frac{x^2+y^2}{2} - \\frac{(x+y)^2}{4} = \\frac{(x-y)^2}{4}.",
      "\\text{So we need } (x-y)^2/4 \\geq |x-y|, \\text{ which holds for } |x-y| \\geq 4. \\text{ Hence } f(x) = x^2 \\text{ is very convex on a neighborhood.} \\blacksquare"
    ]
  },
  {
    key: "putnam-2003-b1",
    contest: "Putnam 2003 B1",
    problemId: "cmo8qdszk000wy99yyhhz9xxo",
    correct: [
      "\\text{Answer: no. Suppose for contradiction such polynomials } a(x), b(x), c(y), d(y) \\text{ exist.}",
      "\\text{Fix three distinct real numbers } y_1, y_2, y_3. \\text{ At each } y_i \\text{ the identity reads } 1 + x y_i + x^2 y_i^2 = c(y_i) a(x) + d(y_i) b(x).",
      "\\text{So each polynomial } 1 + x y_i + x^2 y_i^2 \\text{ lies in the 2-dimensional span } V = \\text{span}\\{a(x), b(x)\\}.",
      "\\text{The three polynomials } \\{1 + x y_i + x^2 y_i^2\\}_{i=1,2,3} \\text{ form a } 3\\times 3 \\text{ matrix of coefficients } \\begin{pmatrix}1 & y_i & y_i^2\\end{pmatrix}, \\text{ a Vandermonde matrix with } y_1, y_2, y_3 \\text{ distinct, hence nonsingular.}",
      "\\text{So the three polynomials are linearly independent in the space of polynomials in } x, \\text{ but } \\dim V = 2, \\text{ contradiction.}",
      "\\text{Therefore no such polynomials exist.} \\blacksquare"
    ],
    wrong: [
      "\\text{Try } a(x) = 1,\\ b(x) = x,\\ c(y) = 1,\\ d(y) = y.",
      "\\text{Then } a(x)c(y) + b(x)d(y) = 1 + xy.",
      "\\text{But we need } 1 + xy + x^2 y^2, \\text{ so add } x^2 y^2 \\text{ by setting } a(x) = 1 + x^2, c(y) = 1 + y^2.",
      "\\text{Check: } (1+x^2)(1+y^2) + x y = 1 + y^2 + x^2 + x^2 y^2 + xy. \\text{ Not equal to } 1 + xy + x^2 y^2 \\text{ — but close, so the answer is yes with adjustment.} \\blacksquare"
    ]
  },
  {
    key: "putnam-1999-a2",
    contest: "Putnam 1999 A2",
    problemId: "cmo8qdwbk000zy99yr5ejj5nj",
    correct: [
      "\\text{Factor } p(x) \\text{ over } \\mathbb{C}:\\ p(x) = c \\prod_i (x - r_i)^{m_i} \\text{ with } c \\in \\mathbb{R}.",
      "\\text{Nonneg on } \\mathbb{R} \\text{ forces: (i) } c > 0;\\ (ii)\\ \\text{every real root has even multiplicity};\\ (iii)\\ \\text{complex roots come in conjugate pairs.}",
      "\\text{Each conjugate pair factor } (x-z)(x-\\bar z) = (x - \\text{Re}\\,z)^2 + (\\text{Im}\\,z)^2 = u(x)^2 + v(x)^2 \\text{ with } u, v \\in \\mathbb{R}[x].",
      "\\text{Real-root factors contribute } [(x-r)^{m/2}]^2, \\text{ a perfect square.}",
      "\\text{The leading constant } c = (\\sqrt c)^2. \\text{ Multiply all SOS-of-2 factors using the Brahmagupta-Fibonacci identity } (u^2+v^2)(s^2+t^2) = (us+vt)^2 + (ut-vs)^2.",
      "\\text{The result is } p(x) = f_1(x)^2 + f_2(x)^2 \\text{ (i.e. } k = 2 \\text{ suffices)}. \\blacksquare"
    ],
    wrong: [
      "\\text{Since } p(x) \\geq 0, \\text{ we can set } f_1(x) = \\sqrt{p(x)} \\text{ and then } p(x) = f_1(x)^2, \\text{ done with } k=1. \\blacksquare"
    ]
  },
  {
    key: "usajmo-2011-p1",
    contest: "USAJMO 2011 P1",
    problemId: "cmo8qdxed0012y99yykq7y91f",
    correct: [
      "\\text{Check } n = 1:\\ 2 + 12 + 2011 = 2025 = 45^2. \\text{ So } n=1 \\text{ works.}",
      "\\text{Claim: for } n \\geq 2 \\text{ there are no solutions. Work modulo 3: } 2 \\equiv -1,\\ 12 \\equiv 0,\\ 2011 \\equiv 1 \\pmod{3}.",
      "\\text{So } 2^n + 12^n + 2011^n \\equiv (-1)^n + 0 + 1^n = (-1)^n + 1 \\pmod 3.",
      "\\text{For } n \\text{ even, this is } 2 \\pmod 3; \\text{ but 2 is not a quadratic residue mod 3 (QRs mod 3 are 0 and 1), so no perfect square.}",
      "\\text{For } n \\text{ odd and } n \\geq 3:\\ \\text{ work mod 4: } 2^n \\equiv 0,\\ 12^n \\equiv 0,\\ 2011^n \\equiv 3^n \\equiv 3 \\pmod 4 \\text{ (since } n \\text{ odd). Hence the sum } \\equiv 3 \\pmod 4, \\text{ but QRs mod 4 are 0 and 1.}",
      "\\text{Both parity cases ruled out for } n \\geq 2. \\text{ Therefore the only solution is } n = 1. \\blacksquare"
    ],
    wrong: [
      "\\text{For large } n, \\text{ the term } 2011^n \\text{ dominates, so } 2^n + 12^n + 2011^n \\approx 2011^n.",
      "\\text{Since } 2011 \\text{ is not a perfect square, } 2011^n \\text{ is a perfect square iff } n \\text{ is even.}",
      "\\text{Hence for even } n, \\text{ the sum is close to } (2011^{n/2})^2, \\text{ and since } 2^n + 12^n \\text{ is small compared, the sum is a perfect square for all even } n. \\blacksquare"
    ]
  },
  {
    key: "putnam-2005-b1",
    contest: "Putnam 2005 B1",
    problemId: "cmo8qdyr30015y99ymf53dj55",
    correct: [
      "\\text{For any real } a, \\text{ write } a = n + f \\text{ with } n = \\lfloor a \\rfloor \\in \\mathbb{Z} \\text{ and } f \\in [0, 1).",
      "\\text{Then } 2a = 2n + 2f \\text{ where } 2f \\in [0, 2).",
      "\\text{Case 1: } f < 1/2 \\Rightarrow 2f < 1 \\Rightarrow \\lfloor 2a \\rfloor = 2n.",
      "\\text{Case 2: } f \\geq 1/2 \\Rightarrow 2f \\in [1, 2) \\Rightarrow \\lfloor 2a \\rfloor = 2n + 1.",
      "\\text{So in all cases } \\lfloor 2a \\rfloor - 2\\lfloor a \\rfloor \\in \\{0, 1\\}, \\text{ i.e. } \\lfloor 2a \\rfloor - 2\\lfloor a \\rfloor \\in \\{0, 1\\}.",
      "\\text{Let } P(x, y) = (y - 2x)(y - 2x - 1). \\text{ Then } P(\\lfloor a \\rfloor, \\lfloor 2a \\rfloor) = 0 \\text{ for all } a \\in \\mathbb{R}. \\blacksquare"
    ],
    wrong: [
      "\\text{Let } P(x, y) = y - 2x.",
      "\\text{Then } P(\\lfloor a \\rfloor, \\lfloor 2a \\rfloor) = \\lfloor 2a \\rfloor - 2\\lfloor a \\rfloor.",
      "\\text{Since } \\lfloor 2a \\rfloor = 2\\lfloor a \\rfloor \\text{ by standard floor identities, } P \\text{ vanishes. } P \\neq 0, \\text{ so done.} \\blacksquare"
    ]
  }
];

type SubmissionReport = {
  label: string;
  expectation: "correct" | "wrong";
  coverage: MilestoneCoverage[];
  overallFeedback: string;
  counts: Record<MilestoneCoverageStatus, number>;
  passedExpectation: boolean;
};

function countCoverage(coverage: MilestoneCoverage[]): Record<MilestoneCoverageStatus, number> {
  const out: Record<MilestoneCoverageStatus, number> = {
    ESTABLISHED: 0,
    REPLACED: 0,
    PARTIAL: 0,
    MISSING: 0,
    INVALID: 0
  };
  for (const c of coverage) out[c.status] += 1;
  return out;
}

// A CORRECT submission "passes" if at least (N-1) milestones are reached
// (ESTABLISHED, REPLACED, or PARTIAL — PARTIAL gets partial credit in
// real grading), with 0 INVALID claims. Tolerates up to 1 MISSING to
// handle fine-grained recipes that over-decompose short proofs.
function correctPasses(counts: Record<MilestoneCoverageStatus, number>, totalMilestones: number): boolean {
  if (counts.INVALID > 0) return false;
  const reached = counts.ESTABLISHED + counts.REPLACED + counts.PARTIAL;
  return reached >= totalMilestones - 1;
}

// A WRONG submission "detected" means the grader flagged at least one
// INVALID milestone — i.e. it specifically caught a false claim rather
// than just marking everything MISSING.
function wrongDetected(counts: Record<MilestoneCoverageStatus, number>): boolean {
  return counts.INVALID >= 1;
}

function color(status: MilestoneCoverageStatus): string {
  switch (status) {
    case "ESTABLISHED":
    case "REPLACED":
      return "\x1b[32m";
    case "INVALID":
      return "\x1b[31m";
    case "PARTIAL":
      return "\x1b[33m";
    case "MISSING":
      return "\x1b[90m";
  }
}
const RESET = "\x1b[0m";

async function gradeSubmission(args: {
  problemStatement: string;
  recipe: StructuredSolution;
  steps: string[];
  label: string;
  expectation: "correct" | "wrong";
}): Promise<SubmissionReport> {
  const stepsForGrader = args.steps.map((latex, index) => ({
    index,
    latex,
    stepType: "DEDUCTION" as const,
    verdict: "PLAUSIBLE" as const,
    verificationBackend: "LLM_JUDGE" as const
  }));
  const review = await generateProofReview({
    problemStatement: args.problemStatement,
    steps: stepsForGrader,
    solutionRecipe: args.recipe
  });
  const counts = countCoverage(review.milestoneCoverage);
  const passed =
    args.expectation === "correct"
      ? correctPasses(counts, args.recipe.steps.length)
      : wrongDetected(counts);
  return {
    label: args.label,
    expectation: args.expectation,
    coverage: review.milestoneCoverage,
    overallFeedback: review.overallFeedback,
    counts,
    passedExpectation: passed
  };
}

async function main() {
  const perCaseReports: Array<{ bench: BenchmarkCase; correct: SubmissionReport; wrong: SubmissionReport }> = [];

  for (const bench of BENCHMARK) {
    console.log(`\n================================================`);
    console.log(`Problem: ${bench.contest} [${bench.problemId}]`);
    const row = await prisma.problem.findUnique({
      where: { id: bench.problemId },
      select: { statement: true, milestoneChecks: true }
    });
    if (!row || !row.statement) {
      console.log(`  SKIP: problem row not found or missing statement`);
      continue;
    }
    if (!isStructuredSolution(row.milestoneChecks)) {
      console.log(`  SKIP: no structured-solution recipe stored`);
      continue;
    }
    const recipe = row.milestoneChecks as StructuredSolution;
    console.log(`  Recipe: ${recipe.goalType}, ${recipe.steps.length} milestone(s)`);

    console.log(`  [CORRECT] grading ${bench.correct.length} step(s)...`);
    const correct = await gradeSubmission({
      problemStatement: row.statement,
      recipe,
      steps: bench.correct,
      label: `${bench.key}-correct`,
      expectation: "correct"
    });
    printSubmissionLine(correct, recipe.steps.length);

    console.log(`  [WRONG]   grading ${bench.wrong.length} step(s)...`);
    const wrong = await gradeSubmission({
      problemStatement: row.statement,
      recipe,
      steps: bench.wrong,
      label: `${bench.key}-wrong`,
      expectation: "wrong"
    });
    printSubmissionLine(wrong, recipe.steps.length);

    perCaseReports.push({ bench, correct, wrong });
  }

  // ------------------------------------------------------------
  // Summary table
  // ------------------------------------------------------------
  console.log("\n\n==============================================");
  console.log("BENCHMARK SUMMARY");
  console.log("==============================================");
  console.log("");
  const correctPassed = perCaseReports.filter((r) => r.correct.passedExpectation).length;
  const wrongDetected = perCaseReports.filter((r) => r.wrong.passedExpectation).length;
  const total = perCaseReports.length;

  const header = `${"Problem".padEnd(22)} | ${"Correct coverage".padEnd(28)} | ${"Wrong coverage".padEnd(28)} | C | W`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of perCaseReports) {
    const c = r.correct.counts;
    const w = r.wrong.counts;
    const cStr = `E${c.ESTABLISHED} R${c.REPLACED} P${c.PARTIAL} M${c.MISSING} I${c.INVALID}`;
    const wStr = `E${w.ESTABLISHED} R${w.REPLACED} P${w.PARTIAL} M${w.MISSING} I${w.INVALID}`;
    const cMark = r.correct.passedExpectation ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    const wMark = r.wrong.passedExpectation ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`${r.bench.contest.padEnd(22)} | ${cStr.padEnd(28)} | ${wStr.padEnd(28)} | ${cMark} | ${wMark}`);
  }
  console.log("");
  console.log(`CORRECT accuracy:   ${correctPassed} / ${total}  (${((100 * correctPassed) / total).toFixed(1)}%)`);
  console.log(`WRONG  detection:   ${wrongDetected} / ${total}  (${((100 * wrongDetected) / total).toFixed(1)}%)`);
  console.log("");
  console.log("Legend: E=ESTABLISHED R=REPLACED P=PARTIAL M=MISSING I=INVALID");
  console.log("✓ correct = E+R+P >= N-1 and 0 INVALID (PARTIAL counts as reached)");
  console.log("✓ wrong   = >=1 INVALID milestone detected");

  await prisma.$disconnect();
}

function printSubmissionLine(rep: SubmissionReport, total: number): void {
  const c = rep.counts;
  const line = `    ${rep.passedExpectation ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ` +
    `E:${c.ESTABLISHED} R:${c.REPLACED} P:${c.PARTIAL} M:${c.MISSING} I:${c.INVALID}  (of ${total})`;
  console.log(line);
  for (const m of rep.coverage) {
    console.log(`      #${m.index} ${color(m.status)}${m.status.padEnd(11)}${RESET} ${m.evidence.slice(0, 160)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
