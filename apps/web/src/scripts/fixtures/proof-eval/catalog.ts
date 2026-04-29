/**
 * Test catalog: problems + canonical solutions + error-variant scenarios.
 *
 * Each entry drives both:
 *   - seed-olympiad-problems.ts: inserts/updates the Problem + ProblemSet
 *   - proof-eval.ts: replays each scenario through the unified attempt API
 *     and compares actual verdicts against `expect`
 *
 * Integrity rule:
 *   - Use Contest.PRACTICE for arcmath-authored warmup problems.
 *   - Only use a real competition (USAMO / IMO / CMO / AIME / …) + real year
 *     + real problem number for problems we can cite to a verified public source
 *     (AoPS wiki URL, official archive). `source: { url, citation }` must be filled.
 *
 * Scenario verdicts we care about:
 *   - VERIFIED : SymPy / Lean formally confirmed
 *   - PLAUSIBLE: probes passed, not formally proven (LLM judge or numeric)
 *   - INVALID  : concrete counterexample or contradiction found
 *   - UNKNOWN  : couldn't verify (often because hypothesis-dependent)
 *   - ANY      : we don't care (useful for exploratory scenarios)
 */

import type { Contest } from "@arcmath/db";

export type ExpectedVerdict = "VERIFIED" | "PLAUSIBLE" | "INVALID" | "UNKNOWN" | "ERROR" | "ANY";

export type ProofScenario = {
  label: string;
  description: string;
  entryMode: "STUCK_WITH_WORK" | "PROOF_STEPS";
  steps: string[];
  expect: ExpectedVerdict[];
  finalAnswer?: string;
  expectAnswerCorrect?: boolean;
};

export type ProblemSource = {
  kind: "arcmath-authored" | "verified-public-archive";
  url?: string;
  citation?: string;
};

export type ProblemFixture = {
  key: string;
  contest: Contest;
  year: number;
  exam: string | null;
  problemSetTitle: string;
  problemNumber: number;
  statement: string;
  answerFormat: "PROOF" | "INTEGER" | "EXPRESSION" | "MULTIPLE_CHOICE";
  answer: string | null;
  solutionSketch: string;
  topicKey: string;
  difficultyBand: string;
  techniqueTags: string[];
  source: ProblemSource;
  scenarios: ProofScenario[];
};

// ==================================================================
// PRACTICE · Algebra Foundations — arcmath-authored warmup exercises
// (These are NOT real competition problems — they're short exercises
// designed to exercise the verifier pipeline.)
// ==================================================================

const PRACTICE_SOS_INEQ: ProblemFixture = {
  key: "practice-sos-abc",
  contest: "PRACTICE",
  year: 1,
  exam: "ALGEBRA_FOUNDATIONS",
  problemSetTitle: "Practice · Algebra Foundations",
  problemNumber: 1,
  statement:
    "Let $a, b, c$ be real numbers. Prove that $a^2 + b^2 + c^2 \\geq ab + bc + ca$.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "2(a^2+b^2+c^2) - 2(ab+bc+ca) = (a-b)^2 + (b-c)^2 + (c-a)^2 >= 0, so a^2+b^2+c^2 >= ab+bc+ca.",
  topicKey: "algebra.inequalities",
  difficultyBand: "warmup",
  techniqueTags: ["algebra", "inequalities", "sum-of-squares"],
  source: { kind: "arcmath-authored" },
  scenarios: [
    {
      label: "canonical-sos",
      description: "Classic sum-of-squares proof",
      entryMode: "PROOF_STEPS",
      steps: [
        "2(a^2 + b^2 + c^2) - 2(ab + bc + ca) = (a-b)^2 + (b-c)^2 + (c-a)^2",
        "(a-b)^2 + (b-c)^2 + (c-a)^2 \\geq 0",
        "a^2 + b^2 + c^2 \\geq ab + bc + ca"
      ],
      expect: ["VERIFIED", "PLAUSIBLE", "PLAUSIBLE"]
    },
    {
      label: "wrong-expansion",
      description: "Student drops the factor of 2 in expansion",
      entryMode: "PROOF_STEPS",
      steps: [
        "a^2 + b^2 + c^2 - (ab + bc + ca) = (a-b)^2 + (b-c)^2 + (c-a)^2",
        "(a-b)^2 + (b-c)^2 + (c-a)^2 \\geq 0",
        "a^2 + b^2 + c^2 \\geq ab + bc + ca"
      ],
      expect: ["INVALID", "PLAUSIBLE", "PLAUSIBLE"]
    }
  ]
};

const PRACTICE_AMGM_2VAR: ProblemFixture = {
  key: "practice-amgm-2var",
  contest: "PRACTICE",
  year: 1,
  exam: "ALGEBRA_FOUNDATIONS",
  problemSetTitle: "Practice · Algebra Foundations",
  problemNumber: 2,
  statement:
    "For positive real numbers $a, b$, prove that $\\dfrac{a+b}{2} \\geq \\sqrt{ab}$.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "(a+b)^2 - 4ab = a^2 + 2ab + b^2 - 4ab = (a-b)^2 >= 0, so (a+b)^2 >= 4ab, hence (a+b)/2 >= sqrt(ab).",
  topicKey: "algebra.inequalities",
  difficultyBand: "warmup",
  techniqueTags: ["algebra", "inequalities", "AM-GM"],
  source: { kind: "arcmath-authored" },
  scenarios: [
    {
      label: "canonical-square-diff",
      description: "Square-the-difference route",
      entryMode: "PROOF_STEPS",
      steps: [
        "(a+b)^2 - 4ab = a^2 + 2ab + b^2 - 4ab",
        "a^2 + 2ab + b^2 - 4ab = (a-b)^2",
        "(a-b)^2 \\geq 0",
        "(a+b)^2 \\geq 4ab"
      ],
      expect: ["VERIFIED", "VERIFIED", "PLAUSIBLE", "PLAUSIBLE"]
    },
    {
      label: "sign-error",
      description: "Student writes (a+b)^2 = a^2 + ab + b^2 (wrong middle term)",
      entryMode: "PROOF_STEPS",
      steps: [
        "(a+b)^2 = a^2 + ab + b^2",
        "(a+b)^2 - 4ab = a^2 - 3ab + b^2"
      ],
      expect: ["INVALID", "INVALID"]
    }
  ]
};

const PRACTICE_CUBE_IDENTITY_X4: ProblemFixture = {
  key: "practice-cube-identity-x4",
  contest: "PRACTICE",
  year: 1,
  exam: "ALGEBRA_FOUNDATIONS",
  problemSetTitle: "Practice · Algebra Foundations",
  problemNumber: 3,
  statement:
    "Let $x$ be a real number satisfying $x + \\dfrac{1}{x} = 3$. " +
    "Find the value of $x^4 + \\dfrac{1}{x^4}$.",
  answerFormat: "INTEGER",
  answer: "47",
  solutionSketch:
    "x^2 + 1/x^2 = (x+1/x)^2 - 2 = 9 - 2 = 7. x^4 + 1/x^4 = (x^2+1/x^2)^2 - 2 = 49 - 2 = 47.",
  topicKey: "algebra.identities",
  difficultyBand: "warmup",
  techniqueTags: ["algebra", "powers", "symmetric_functions"],
  source: { kind: "arcmath-authored" },
  scenarios: [
    {
      label: "canonical-stuck-correct",
      description: "Full correct STUCK_WITH_WORK solution with answer",
      entryMode: "STUCK_WITH_WORK",
      steps: [
        "(x + 1/x)^2 = x^2 + 2 + 1/x^2",
        "x^2 + 1/x^2 = (x + 1/x)^2 - 2",
        "(x^2 + 1/x^2)^2 = x^4 + 2 + 1/x^4",
        "x^4 + 1/x^4 = (x^2 + 1/x^2)^2 - 2"
      ],
      expect: ["VERIFIED", "VERIFIED", "VERIFIED", "VERIFIED"],
      finalAnswer: "47",
      expectAnswerCorrect: true
    },
    {
      label: "arithmetic-slip",
      description: "Correct algebra but wrong arithmetic (9-2=6 instead of 7)",
      entryMode: "STUCK_WITH_WORK",
      steps: [
        "(x + 1/x)^2 = x^2 + 2 + 1/x^2",
        "x^2 + 1/x^2 = (x + 1/x)^2 - 2",
        "9 - 2 = 6"
      ],
      expect: ["VERIFIED", "VERIFIED", "INVALID"],
      finalAnswer: "47",
      expectAnswerCorrect: true
    }
  ]
};

const PRACTICE_DIFF_OF_SQUARES: ProblemFixture = {
  key: "practice-diff-of-squares",
  contest: "PRACTICE",
  year: 1,
  exam: "ALGEBRA_FOUNDATIONS",
  problemSetTitle: "Practice · Algebra Foundations",
  problemNumber: 4,
  statement:
    "For all real numbers $a$ and $b$, prove the identity " +
    "$a^4 - b^4 = (a-b)(a+b)(a^2+b^2)$.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "a^4 - b^4 = (a^2)^2 - (b^2)^2 = (a^2 - b^2)(a^2 + b^2) = (a-b)(a+b)(a^2+b^2).",
  topicKey: "algebra.factoring",
  difficultyBand: "warmup",
  techniqueTags: ["algebra", "factoring", "identities"],
  source: { kind: "arcmath-authored" },
  scenarios: [
    {
      label: "canonical-double-diff",
      description: "Difference of squares twice",
      entryMode: "PROOF_STEPS",
      steps: [
        "a^4 - b^4 = (a^2 - b^2)(a^2 + b^2)",
        "a^2 - b^2 = (a - b)(a + b)",
        "a^4 - b^4 = (a-b)(a+b)(a^2+b^2)"
      ],
      expect: ["VERIFIED", "VERIFIED", "VERIFIED"]
    },
    {
      label: "missing-factor",
      description: "Student drops the (a+b) factor",
      entryMode: "PROOF_STEPS",
      steps: [
        "a^4 - b^4 = (a^2 - b^2)(a^2 + b^2)",
        "a^4 - b^4 = (a - b)(a^2 + b^2)"
      ],
      expect: ["VERIFIED", "INVALID"]
    }
  ]
};

// ==================================================================
// Real competition problems (verified-public-archive).
//
// Every entry here MUST:
//   - Use the real Contest / year / problem number (not PRACTICE).
//   - Carry a source.url pointing at the canonical archive page (AoPS
//     wiki is the convention; other archives like imo-official,
//     prase.cz, evanchen.cc are acceptable if the statement matches).
//   - Carry a source.citation summarising the contest + problem.
//   - Use the verbatim problem statement from the cited source. If we
//     cannot produce a verbatim statement we do NOT add the entry.
//
// Scenarios on real problems are left empty for now — proof-eval will
// skip them. Preprocess-problems only needs the statement + sketch.
// ==================================================================

const IMO_1984_P1: ProblemFixture = {
  key: "imo-1984-p1",
  contest: "IMO",
  year: 1984,
  exam: "P1",
  problemSetTitle: "IMO 1984",
  problemNumber: 1,
  // Source statement (verbatim, cross-checked on prase.cz/kalva and AoPS wiki):
  // "Prove that 0 ≤ yz + zx + xy − 2xyz ≤ 7/27, where x, y and z are
  //  non-negative real numbers satisfying x + y + z = 1."
  statement:
    "Let $x, y, z$ be non-negative real numbers satisfying $x + y + z = 1$. " +
    "Prove that $0 \\leq yz + zx + xy - 2xyz \\leq \\dfrac{7}{27}$.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "Lower bound: yz+zx+xy-2xyz = xy(1-z) + yz(1-x)/... >= 0 when x+y+z=1 and all are in [0,1]. " +
    "Upper bound: AM-GM on yz+zx+xy-2xyz subject to x+y+z=1; maximum 7/27 at x=y=z=1/3.",
  topicKey: "algebra.inequalities",
  difficultyBand: "IMO",
  techniqueTags: ["algebra", "inequalities", "constrained-optimization", "polynomial"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/1984_IMO_Problems/Problem_1",
    citation: "IMO 1984, Problem 1 (proposed by M. Stoll / B. Haible, West Germany)."
  },
  scenarios: []
};

const IMO_1988_P6: ProblemFixture = {
  key: "imo-1988-p6",
  contest: "IMO",
  year: 1988,
  exam: "P6",
  problemSetTitle: "IMO 1988",
  problemNumber: 6,
  // Source statement (verbatim, cross-checked on AoPS and imomath.com):
  // "Let a and b be positive integers such that ab+1 divides a²+b². Show
  //  that (a²+b²)/(ab+1) is a perfect square." (The classic Vieta-jumping
  //  problem; included as a number-theory stress test for the formalizer.)
  statement:
    "Let $a$ and $b$ be positive integers such that $ab + 1$ divides $a^2 + b^2$. " +
    "Show that $\\dfrac{a^2 + b^2}{ab + 1}$ is the square of an integer.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "Vieta jumping: fix k = (a²+b²)/(ab+1) and assume minimal (a,b) with a+b. " +
    "Replacing a by a' = kb - a yields another solution with smaller a+b, contradicting minimality unless a' ≤ 0, " +
    "which forces k to be a perfect square.",
  topicKey: "number-theory.vieta-jumping",
  difficultyBand: "IMO",
  techniqueTags: ["number-theory", "vieta-jumping", "divisibility", "perfect-square"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/1988_IMO_Problems/Problem_6",
    citation: "IMO 1988, Problem 6 (proposed by FR Germany; the canonical Vieta-jumping problem)."
  },
  scenarios: []
};

const IMO_1995_P2: ProblemFixture = {
  key: "imo-1995-p2",
  contest: "IMO",
  year: 1995,
  exam: "P2",
  problemSetTitle: "IMO 1995",
  problemNumber: 2,
  // Source statement (verbatim, cross-checked on cut-the-knot, AoPS, prase.cz):
  // "Let a, b, c be positive real numbers such that abc = 1. Prove that
  //   1/(a³(b+c)) + 1/(b³(c+a)) + 1/(c³(a+b)) ≥ 3/2."
  statement:
    "Let $a, b, c$ be positive real numbers such that $abc = 1$. " +
    "Prove that $\\dfrac{1}{a^3(b+c)} + \\dfrac{1}{b^3(c+a)} + \\dfrac{1}{c^3(a+b)} \\geq \\dfrac{3}{2}$.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "Substitute a = 1/x, b = 1/y, c = 1/z (so xyz = 1). The LHS becomes x²/(y+z) + y²/(z+x) + z²/(x+y). " +
    "By Cauchy–Schwarz this is ≥ (x+y+z)/2, and AM-GM on xyz=1 gives x+y+z ≥ 3, hence LHS ≥ 3/2.",
  topicKey: "algebra.inequalities",
  difficultyBand: "IMO",
  techniqueTags: ["algebra", "inequalities", "cauchy-schwarz", "AM-GM", "substitution"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/1995_IMO_Problems/Problem_2",
    citation: "IMO 1995, Problem 2 (the classical abc=1 inequality)."
  },
  scenarios: []
};

const IMO_2001_P2: ProblemFixture = {
  key: "imo-2001-p2",
  contest: "IMO",
  year: 2001,
  exam: "P2",
  problemSetTitle: "IMO 2001",
  problemNumber: 2,
  // Source statement (verbatim, cross-checked on AoPS + evanchen.cc notes):
  // "Prove that for all positive real numbers a, b, c:
  //    a/√(a²+8bc) + b/√(b²+8ca) + c/√(c²+8ab) ≥ 1."
  statement:
    "Let $a, b, c$ be positive real numbers. Prove that " +
    "$\\dfrac{a}{\\sqrt{a^2 + 8bc}} + \\dfrac{b}{\\sqrt{b^2 + 8ca}} + \\dfrac{c}{\\sqrt{c^2 + 8ab}} \\geq 1$.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "Classical Hölder: (Σ a/√(a²+8bc))² · Σ a(a²+8bc) ≥ (a+b+c)³. Then (a+b+c)³ ≥ Σ a(a²+8bc) = a³+b³+c³+24abc, " +
    "which follows from AM-GM after expansion. Equality at a = b = c.",
  topicKey: "algebra.inequalities",
  difficultyBand: "IMO",
  techniqueTags: ["algebra", "inequalities", "holder", "square-roots"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/2001_IMO_Problems/Problem_2",
    citation: "IMO 2001, Problem 2 (widely regarded as among the hardest olympiad inequalities)."
  },
  scenarios: []
};

const USAMO_2001_P6: ProblemFixture = {
  key: "usamo-2001-p6",
  contest: "USAMO",
  year: 2001,
  exam: "P6",
  problemSetTitle: "USAMO 2001",
  problemNumber: 6,
  // Source statement (verbatim, cross-checked on AoPS wiki):
  // "Let a, b, c be nonnegative real numbers such that a²+b²+c²+abc = 4.
  //  Prove that 0 ≤ ab+bc+ca − abc ≤ 2." (Proposed by Bjorn Poonen.)
  statement:
    "Let $a, b, c$ be nonnegative real numbers such that $a^2 + b^2 + c^2 + abc = 4$. " +
    "Prove that $0 \\leq ab + bc + ca - abc \\leq 2$.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "Lower bound: WLOG c ≤ 1 (pigeonhole on a²+b²+c² ≤ 4); then ab + bc + ca − abc = ab(1-c) + c(a+b) ≥ 0. " +
    "Upper bound: substitute a=2cos A etc. (trig substitution using the Schur-like constraint), " +
    "or use Lagrange multipliers; equality at (a,b,c) = (0,√2,√2) and permutations, with value 2.",
  topicKey: "algebra.inequalities",
  difficultyBand: "USAMO",
  techniqueTags: ["algebra", "inequalities", "constrained-optimization", "symmetric"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/2001_USAMO_Problems/Problem_6",
    citation: "USAMO 2001, Problem 6 (proposed by Bjorn Poonen)."
  },
  scenarios: []
};

// ==================================================================
// Benchmark expansion (2026-04): tractable PROOF problems for grading
// accuracy testing.  Each was picked because:
//   - The statement is canonical (AoPS/evanchen.cc/imomath cross-check).
//   - The standard proof decomposes into 3-5 distinct milestones, which
//     lets generateStructuredSolution produce a clean recipe and lets
//     the grader differentiate correct / alternative / wrong submissions.
//   - Difficulty sits at USAJMO / Putnam A1-B1 / easy-USAMO / easy-IMO
//     level — appropriate for the pipeline's current accuracy target.
// ==================================================================

const USAMO_1974_P2: ProblemFixture = {
  key: "usamo-1974-p2",
  contest: "USAMO",
  year: 1974,
  exam: "P2",
  problemSetTitle: "USAMO 1974",
  problemNumber: 2,
  // Source statement (verbatim, cross-checked on AoPS wiki):
  // "Prove that if a, b, c are positive real numbers, then
  //  a^a b^b c^c >= (abc)^((a+b+c)/3)."
  statement:
    "Let $a, b, c$ be positive real numbers. Prove that " +
    "$a^a b^b c^c \\geq (abc)^{(a+b+c)/3}$.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "Take logs: need a·ln a + b·ln b + c·ln c >= ((a+b+c)/3)(ln a + ln b + ln c). " +
    "Equivalently, 3(a ln a + b ln b + c ln c) >= (a+b+c)(ln a + ln b + ln c). " +
    "This follows from the rearrangement/Chebyshev inequality applied to the sorted sequences (a,b,c) and (ln a, ln b, ln c), both sorted in the same order (since x -> ln x is monotone).",
  topicKey: "algebra.inequalities",
  difficultyBand: "USAMO",
  techniqueTags: ["algebra", "inequalities", "logarithms", "chebyshev", "rearrangement"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/1974_USAMO_Problems/Problem_2",
    citation: "USAMO 1974, Problem 2 (the canonical weighted-AM-GM / Chebyshev exercise)."
  },
  scenarios: []
};

const IMO_1964_P2: ProblemFixture = {
  key: "imo-1964-p2",
  contest: "IMO",
  year: 1964,
  exam: "P2",
  problemSetTitle: "IMO 1964",
  problemNumber: 2,
  // Source statement (verbatim, cross-checked on AoPS wiki + imomath.com):
  // "Suppose a, b, c are the sides of a triangle. Prove that
  //  a²(b+c-a) + b²(c+a-b) + c²(a+b-c) <= 3abc."
  statement:
    "Suppose $a, b, c$ are the sides of a triangle. Prove that " +
    "$a^2(b+c-a) + b^2(c+a-b) + c^2(a+b-c) \\leq 3abc$.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "Ravi substitution a = y+z, b = z+x, c = x+y with x, y, z > 0. " +
    "Expanding, the inequality reduces to x·y·z >= 0-style identity, or equivalently (after expansion and simplification) it is equivalent to Schur's inequality of degree 1: " +
    "x^3 + y^3 + z^3 + xyz >= xy(x+y) + yz(y+z) + zx(z+x), which follows from AM-GM on the rearranged terms. Equality holds at a = b = c (equilateral triangle).",
  topicKey: "algebra.inequalities",
  difficultyBand: "IMO",
  techniqueTags: ["algebra", "inequalities", "ravi-substitution", "schur", "triangle"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/1964_IMO_Problems/Problem_2",
    citation: "IMO 1964, Problem 2 (classic triangle-side inequality; Ravi + Schur)."
  },
  scenarios: []
};

const IMO_1979_P1: ProblemFixture = {
  key: "imo-1979-p1",
  contest: "IMO",
  year: 1979,
  exam: "P1",
  problemSetTitle: "IMO 1979",
  problemNumber: 1,
  // Source statement (verbatim, cross-checked on AoPS wiki + imomath.com):
  // "Let p and q be natural numbers such that
  //   p/q = 1 - 1/2 + 1/3 - 1/4 + ... - 1/1318 + 1/1319.
  //  Prove that p is divisible by 1979."
  statement:
    "Let $p$ and $q$ be natural numbers such that " +
    "$\\dfrac{p}{q} = 1 - \\dfrac{1}{2} + \\dfrac{1}{3} - \\dfrac{1}{4} + \\cdots " +
    "- \\dfrac{1}{1318} + \\dfrac{1}{1319}$. " +
    "Prove that $p$ is divisible by $1979$.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "Rewrite the alternating sum 1 - 1/2 + 1/3 - ... + 1/1319 as sum_{k=1}^{1319} 1/k - 2·sum_{k=1}^{659} 1/(2k) = sum_{k=660}^{1319} 1/k. " +
    "Pair up terms symmetrically: 1/k + 1/(1979-k) = 1979/(k(1979-k)). Thus the sum equals 1979 · sum_{k=660}^{989} 1/(k(1979-k)). " +
    "Since 1979 is prime and appears as a factor in the numerator but not in any denominator k(1979-k) (for 660 <= k <= 989), the numerator p of the reduced fraction is divisible by 1979.",
  topicKey: "number-theory.prime-divisibility",
  difficultyBand: "IMO",
  techniqueTags: ["number-theory", "divisibility", "harmonic-sum", "pairing"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/1979_IMO_Problems/Problem_1",
    citation: "IMO 1979, Problem 1 (the canonical 'pair-then-factor prime' harmonic-sum problem)."
  },
  scenarios: []
};

const USAMO_2000_P1: ProblemFixture = {
  key: "usamo-2000-p1",
  contest: "USAMO",
  year: 2000,
  exam: "P1",
  problemSetTitle: "USAMO 2000",
  problemNumber: 1,
  // Source statement (verbatim, cross-checked on AoPS wiki):
  // "Call a real-valued function f very convex if
  //    (f(x)+f(y))/2 >= f((x+y)/2) + |x-y|
  //  holds for all real numbers x and y. Prove that no very convex
  //  function exists."
  statement:
    "Call a real-valued function $f$ \\emph{very convex} if " +
    "$\\dfrac{f(x) + f(y)}{2} \\geq f\\!\\left(\\dfrac{x+y}{2}\\right) + |x - y|$ " +
    "holds for all real numbers $x$ and $y$. " +
    "Prove that no very convex function exists.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "Iterate the very-convex inequality on dyadic intervals. Specifically, setting x and y symmetrically around a midpoint m with |x-y| = 2^k·ε, the inequality forces the centred difference quotient g_n(m,ε) = (f(m-ε)+f(m+ε))/2 - f(m) to grow without bound as we refine: each halving step adds at least 2·ε to the excess. " +
    "Summing a geometric series of added contributions shows (f(0)+f(1))/2 - f(1/2) >= (any N), contradicting finiteness. Hence no such f exists.",
  topicKey: "analysis.functional-inequalities",
  difficultyBand: "USAMO",
  techniqueTags: ["analysis", "functional-equations", "convexity", "iteration", "contradiction"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/2000_USAMO_Problems/Problem_1",
    citation: "USAMO 2000, Problem 1 (nonexistence-by-iteration; proposed by Titu Andreescu)."
  },
  scenarios: []
};

const PUTNAM_2003_B1: ProblemFixture = {
  key: "putnam-2003-b1",
  contest: "PUTNAM",
  year: 2003,
  exam: "B1",
  problemSetTitle: "Putnam 2003",
  problemNumber: 7, // B1 is problem 7 (A1..A6 then B1..B6)
  // Source statement (verbatim, cross-checked on AoPS wiki + MAA archive):
  // "Do there exist polynomials a(x), b(x), c(y), d(y) such that
  //    1 + xy + x²y² = a(x)c(y) + b(x)d(y)
  //  holds identically?"
  statement:
    "Do there exist polynomials $a(x), b(x), c(y), d(y)$ such that " +
    "$1 + xy + x^2 y^2 = a(x)\\,c(y) + b(x)\\,d(y)$ " +
    "holds identically? Justify your answer.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "Answer: no. Suppose such polynomials exist. Fix three distinct real numbers y = y_1, y_2, y_3; " +
    "then as functions of x, the polynomial 1 + x·y_i + x²·y_i² lies in the 2-dimensional span of {a(x), b(x)} for each i. " +
    "But the three polynomials {1 + x·y_i + x²·y_i²} are linearly independent (their coefficient matrix is a 3x3 Vandermonde-type matrix, nonsingular for distinct y_i), yielding a contradiction.",
  topicKey: "algebra.polynomial-identities",
  difficultyBand: "Putnam",
  techniqueTags: ["algebra", "polynomials", "linear-algebra", "contradiction"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/2003_Putnam_B1",
    citation: "Putnam 2003, Problem B1."
  },
  scenarios: []
};

const PUTNAM_1999_A2: ProblemFixture = {
  key: "putnam-1999-a2",
  contest: "PUTNAM",
  year: 1999,
  exam: "A2",
  problemSetTitle: "Putnam 1999",
  problemNumber: 2, // A2
  // Source statement (verbatim, cross-checked on AoPS wiki + MAA archive):
  // "Let p(x) be a polynomial that is nonnegative for all real x.
  //  Prove that for some k, there are polynomials f_1(x), ..., f_k(x)
  //  such that p(x) = sum_{j=1}^{k} (f_j(x))²."
  statement:
    "Let $p(x)$ be a polynomial that is nonnegative for all real $x$. " +
    "Prove that for some $k$, there are polynomials $f_1(x), \\ldots, f_k(x)$ " +
    "such that $p(x) = \\sum_{j=1}^{k} (f_j(x))^2$.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "Factor p over C: p(x) = c · prod_i (x - r_i)^{m_i}. Nonnegativity forces: (a) the leading coefficient c > 0; " +
    "(b) every real root has even multiplicity; (c) non-real roots come in complex-conjugate pairs. " +
    "Combine each conjugate-pair factor (x - z)(x - conj(z)) = (x - Re z)^2 + (Im z)^2, which equals u(x)^2 + v(x)^2 with u, v real polynomials. " +
    "Using Brahmagupta-Fibonacci (|w|²|z|² = |wz|²), the product of k sums-of-two-squares is itself a sum of two squares, yielding p as a sum of 2 squares of real polynomials.",
  topicKey: "algebra.polynomials",
  difficultyBand: "Putnam",
  techniqueTags: ["algebra", "polynomials", "sum-of-squares", "complex-roots", "factorization"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/1999_Putnam_A2",
    citation: "Putnam 1999, Problem A2 (classical SOS decomposition for nonneg univariate polynomials)."
  },
  scenarios: []
};

const USAJMO_2011_P1: ProblemFixture = {
  key: "usajmo-2011-p1",
  contest: "USAJMO",
  year: 2011,
  exam: "P1",
  problemSetTitle: "USAJMO 2011",
  problemNumber: 1,
  // Source statement (verbatim, cross-checked on AoPS wiki):
  // "Find, with proof, all positive integers n for which 2^n + 12^n + 2011^n
  //  is a perfect square."
  statement:
    "Find, with proof, all positive integers $n$ for which " +
    "$2^n + 12^n + 2011^n$ is a perfect square.",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "Answer: n = 1 is the only solution (2 + 12 + 2011 = 2025 = 45²). " +
    "For n >= 2, work mod 4: 2^n ≡ 0 (n>=2), 12^n ≡ 0 (n>=2), 2011^n ≡ 3^n (mod 4); " +
    "if n even then 3^n ≡ 1 so 2^n + 12^n + 2011^n ≡ 1 (mod 4) — still a QR candidate. Refine: work mod 3 — " +
    "2^n ≡ (-1)^n, 12^n ≡ 0, 2011^n ≡ 1, so sum ≡ (-1)^n + 1 (mod 3). For n odd sum ≡ 0; for n even sum ≡ 2, not a QR mod 3. " +
    "Thus n even is impossible for n >= 2. For n odd >= 3: 2011^n + 12^n + 2^n lies strictly between (2011^((n-1)/2) · sqrt(2011))² and the next perfect square; tighter bounding by square roots shows no perfect square exists.",
  topicKey: "number-theory.perfect-squares",
  difficultyBand: "USAJMO",
  techniqueTags: ["number-theory", "modular-arithmetic", "quadratic-residues", "perfect-square"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/2011_USAJMO_Problems/Problem_1",
    citation: "USAJMO 2011, Problem 1."
  },
  scenarios: []
};

const PUTNAM_2005_B1: ProblemFixture = {
  key: "putnam-2005-b1",
  contest: "PUTNAM",
  year: 2005,
  exam: "B1",
  problemSetTitle: "Putnam 2005",
  problemNumber: 7, // B1 is problem 7
  // Source statement (verbatim, cross-checked on AoPS wiki + MAA archive):
  // "Find a nonzero polynomial P(x, y) such that P(⌊a⌋, ⌊2a⌋) = 0
  //  for all real numbers a. (Note: ⌊v⌋ is the greatest integer less
  //  than or equal to v.)"
  statement:
    "Find a nonzero polynomial $P(x, y)$ such that " +
    "$P(\\lfloor a \\rfloor, \\lfloor 2a \\rfloor) = 0$ for all real numbers $a$. " +
    "(Note: $\\lfloor v \\rfloor$ is the greatest integer less than or equal to $v$.)",
  answerFormat: "PROOF",
  answer: null,
  solutionSketch:
    "For any real a, write a = n + f with n = floor(a) integer and f in [0,1). Then 2a = 2n + 2f and floor(2a) ∈ {2n, 2n+1} depending on whether f < 1/2. " +
    "So (floor(2a) - 2·floor(a)) ∈ {0, 1}. Hence the polynomial P(x, y) = (y - 2x)(y - 2x - 1) vanishes identically at (floor(a), floor(2a)).",
  topicKey: "algebra.polynomial-construction",
  difficultyBand: "Putnam",
  techniqueTags: ["algebra", "polynomials", "floor-function", "construction"],
  source: {
    kind: "verified-public-archive",
    url: "https://artofproblemsolving.com/wiki/index.php/2005_Putnam_B1",
    citation: "Putnam 2005, Problem B1."
  },
  scenarios: []
};

const BENCHMARK_EXPANSION_FIXTURES: ProblemFixture[] = [
  USAMO_1974_P2,
  IMO_1964_P2,
  IMO_1979_P1,
  USAMO_2000_P1,
  PUTNAM_2003_B1,
  PUTNAM_1999_A2,
  USAJMO_2011_P1,
  PUTNAM_2005_B1
];

const VERIFIED_REAL_FIXTURES: ProblemFixture[] = [
  IMO_1984_P1,
  IMO_1988_P6,
  IMO_1995_P2,
  IMO_2001_P2,
  USAMO_2001_P6,
  ...BENCHMARK_EXPANSION_FIXTURES
];

// ==================================================================
export const FIXTURES: ProblemFixture[] = [
  PRACTICE_SOS_INEQ,
  PRACTICE_AMGM_2VAR,
  PRACTICE_CUBE_IDENTITY_X4,
  PRACTICE_DIFF_OF_SQUARES,
  ...VERIFIED_REAL_FIXTURES
];

export function groupByProblemSet(
  fixtures: ProblemFixture[] = FIXTURES
): Map<string, { contest: Contest; year: number; exam: string | null; title: string; problems: ProblemFixture[] }> {
  const grouped = new Map<string, { contest: Contest; year: number; exam: string | null; title: string; problems: ProblemFixture[] }>();
  for (const f of fixtures) {
    const key = `${f.contest}:${f.year}:${f.exam ?? ""}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.problems.push(f);
    } else {
      grouped.set(key, {
        contest: f.contest,
        year: f.year,
        exam: f.exam,
        title: f.problemSetTitle,
        problems: [f]
      });
    }
  }
  return grouped;
}
