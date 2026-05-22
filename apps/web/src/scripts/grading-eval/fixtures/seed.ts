/**
 * Seed gold set — 5 handcrafted fixtures so the harness has something
 * to run against on day 1. Each fixture is small enough to be reviewed
 * end-to-end and exercises a different slice of the merge logic.
 *
 * The plan is to layer miniF2F-lean4 / OlympiadBench / PutnamBench
 * imports on top of these. Treat this file as a smoke set, not a
 * baseline measurement.
 */

import type { GradingFixture } from "../types";

const NOW = "2026-05-10T00:00:00.000Z";

export const SEED_FIXTURES: GradingFixture[] = [
  {
    key: "seed-amgm-2var",
    source: "INTERNAL_AUTHORED",
    problemStatement: "Prove that for all real numbers a and b, a^2 + b^2 ≥ 2ab.",
    rubric: {
      problemId: "seed-amgm-2var",
      version: "seed-v1",
      generatedAt: NOW,
      source: "AUTHORED",
      approvedAt: NOW,
      goalStatement: "a^2 + b^2 ≥ 2ab",
      milestones: [
        {
          id: "seed-amgm-2var::m1",
          index: 1,
          title: "Square is non-negative",
          claim: "(a-b)^2 ≥ 0",
          techniques: ["SOS"],
          dependsOn: [],
          critical: true
        },
        {
          id: "seed-amgm-2var::m2",
          index: 2,
          title: "Expand",
          claim: "a^2 - 2ab + b^2 ≥ 0",
          techniques: ["expansion"],
          dependsOn: ["seed-amgm-2var::m1"],
          critical: true
        },
        {
          id: "seed-amgm-2var::m3",
          index: 3,
          title: "Rearrange",
          claim: "a^2 + b^2 ≥ 2ab",
          techniques: ["rearrangement"],
          dependsOn: ["seed-amgm-2var::m2"],
          critical: true
        }
      ],
      commonPitfalls: [
        "skipping the (a-b)^2 ≥ 0 lemma and asserting AM-GM directly"
      ]
    },
    studentSolutions: [
      {
        label: "clean-sos",
        description: "textbook SOS proof",
        category: "CLEAN_CORRECT",
        steps: [
          { latex: "(a-b)^2 \\geq 0", expectedVerdict: "VERIFIED" },
          { latex: "a^2 - 2ab + b^2 \\geq 0", expectedVerdict: "VERIFIED" },
          { latex: "a^2 + b^2 \\geq 2ab", expectedVerdict: "VERIFIED" }
        ],
        expectedFinalCorrect: true
      },
      {
        // The step-level grader credits the claim as true (it is) via
        // the dual-judge + SymPy probe-pass coincidence rule. The
        // PROOF-level failure shows up in milestoneCoverage: only the
        // final milestone is hit, the SOS and expansion milestones
        // are MISSING → `expectedFinalCorrect: false`. This is the
        // right architectural split: step grading verifies math
        // truth, rubric grading enforces "did the student actually
        // prove it".
        label: "skipped-justification",
        description: "asserts AM-GM with no derivation",
        category: "VALID_SCAFFOLD_WRONG_FINAL",
        steps: [{ latex: "a^2 + b^2 \\geq 2ab", expectedVerdict: "VERIFIED" }],
        expectedFinalCorrect: false
      },
      {
        label: "false-scaling",
        description: "claims a^2 ≥ ab universally — false for a<b<0",
        category: "FALSE_BUT_PLAUSIBLE",
        steps: [{ latex: "a^2 \\geq ab", expectedVerdict: "INVALID" }],
        expectedFinalCorrect: false
      }
    ]
  },
  {
    key: "seed-final-answer-rational",
    source: "INTERNAL_AUTHORED",
    problemStatement:
      "Simplify (6 * 1) / 8 and express your answer as a reduced fraction.",
    rubric: {
      problemId: "seed-final-answer-rational",
      version: "seed-v1",
      generatedAt: NOW,
      source: "AUTHORED",
      approvedAt: NOW,
      goalStatement: "3/4",
      milestones: [
        {
          id: "seed-final-answer-rational::m1",
          index: 1,
          title: "Final answer",
          claim: "3/4",
          techniques: ["reduction"],
          dependsOn: [],
          critical: true
        }
      ],
      commonPitfalls: ["writing 6/8 without reducing"]
    },
    studentSolutions: [
      {
        label: "reduced",
        description: "writes 3/4",
        category: "CLEAN_CORRECT",
        steps: [{ latex: "3/4", expectedVerdict: "VERIFIED" }],
        expectedFinalCorrect: true
      },
      {
        label: "equivalent-form",
        description: "writes 0.75",
        category: "ALT_CORRECT",
        steps: [{ latex: "0.75", expectedVerdict: "VERIFIED" }],
        expectedFinalCorrect: true
      },
      {
        label: "unreduced-but-equivalent",
        description: "writes 6/8",
        category: "ALT_CORRECT",
        steps: [{ latex: "6/8", expectedVerdict: "VERIFIED" }],
        expectedFinalCorrect: true
      },
      {
        label: "wrong",
        description: "writes 4/5",
        category: "TOTALLY_WRONG",
        steps: [{ latex: "4/5", expectedVerdict: "INVALID" }],
        expectedFinalCorrect: false
      }
    ]
  },
  {
    key: "seed-claim-primes",
    source: "INTERNAL_AUTHORED",
    problemStatement: "Prove that there are infinitely many primes.",
    rubric: {
      problemId: "seed-claim-primes",
      version: "seed-v1",
      generatedAt: NOW,
      source: "AUTHORED",
      approvedAt: NOW,
      goalStatement: "There are infinitely many primes.",
      milestones: [
        {
          id: "seed-claim-primes::m1",
          index: 1,
          title: "Final claim",
          claim: "There are infinitely many primes.",
          techniques: ["Euclid", "contradiction"],
          dependsOn: [],
          critical: true
        }
      ],
      commonPitfalls: ["assuming N is prime instead of arguing by cases"]
    },
    studentSolutions: [
      {
        label: "euclid",
        description: "standard Euclid proof condensed to one CLAIM",
        category: "CLEAN_CORRECT",
        steps: [
          {
            latex: "There exist infinitely many primes.",
            expectedVerdict: "ESCALATE"
          }
        ],
        // We cannot expect VERIFIED here without Lean actually running;
        // the harness should ESCALATE in the absence of a deterministic
        // backend. When the Fly verifier is up, this will flip to
        // VERIFIED — re-run after Slice B is live.
        expectedFinalCorrect: true
      }
    ]
  },
  {
    key: "seed-inequality-3var",
    source: "INTERNAL_AUTHORED",
    problemStatement:
      "Prove that for all real numbers a, b, c, a^2 + b^2 + c^2 ≥ ab + bc + ca.",
    rubric: {
      problemId: "seed-inequality-3var",
      version: "seed-v1",
      generatedAt: NOW,
      source: "AUTHORED",
      approvedAt: NOW,
      goalStatement: "a^2 + b^2 + c^2 ≥ ab + bc + ca",
      milestones: [
        {
          id: "seed-inequality-3var::m1",
          index: 1,
          title: "Pairwise SOS",
          claim: "(a-b)^2 + (b-c)^2 + (a-c)^2 ≥ 0",
          techniques: ["SOS"],
          dependsOn: [],
          critical: true
        },
        {
          id: "seed-inequality-3var::m2",
          index: 2,
          title: "Conclusion",
          claim: "a^2 + b^2 + c^2 ≥ ab + bc + ca",
          techniques: ["rearrangement"],
          dependsOn: ["seed-inequality-3var::m1"],
          critical: true
        }
      ],
      commonPitfalls: ["arguing AM-GM pairwise but forgetting to sum"]
    },
    studentSolutions: [
      {
        label: "clean-pairwise",
        description: "standard SOS",
        category: "CLEAN_CORRECT",
        steps: [
          {
            latex: "(a-b)^2 + (b-c)^2 + (a-c)^2 \\geq 0",
            expectedVerdict: "VERIFIED"
          },
          {
            latex: "a^2 + b^2 + c^2 \\geq ab + bc + ca",
            expectedVerdict: "VERIFIED"
          }
        ],
        expectedFinalCorrect: true
      },
      {
        label: "skipped-middle",
        description: "asserts conclusion without showing the SOS step",
        category: "VALID_SCAFFOLD_WRONG_FINAL",
        steps: [
          {
            latex: "a^2 + b^2 + c^2 \\geq ab + bc + ca",
            expectedVerdict: "ESCALATE"
          }
        ],
        expectedFinalCorrect: false
      }
    ]
  },
  {
    key: "seed-deduction-substitution",
    source: "INTERNAL_AUTHORED",
    problemStatement:
      "Given x + y = 5 and xy = 6, find x^2 + y^2.",
    rubric: {
      problemId: "seed-deduction-substitution",
      version: "seed-v1",
      generatedAt: NOW,
      source: "AUTHORED",
      approvedAt: NOW,
      goalStatement: "x^2 + y^2 = 13",
      milestones: [
        {
          id: "seed-deduction-substitution::m1",
          index: 1,
          title: "Identity",
          claim: "(x+y)^2 = x^2 + 2xy + y^2",
          techniques: ["expansion"],
          dependsOn: [],
          critical: true
        },
        {
          id: "seed-deduction-substitution::m2",
          index: 2,
          title: "Substitute",
          claim: "25 = x^2 + y^2 + 12",
          techniques: ["substitution"],
          dependsOn: ["seed-deduction-substitution::m1"],
          critical: true
        },
        {
          id: "seed-deduction-substitution::m3",
          index: 3,
          title: "Final answer",
          claim: "x^2 + y^2 = 13",
          techniques: ["arithmetic"],
          dependsOn: ["seed-deduction-substitution::m2"],
          critical: true
        }
      ],
      commonPitfalls: ["forgetting the 2xy cross term"]
    },
    studentSolutions: [
      {
        label: "clean",
        description: "textbook",
        category: "CLEAN_CORRECT",
        steps: [
          { latex: "(x+y)^2 = x^2 + 2xy + y^2", expectedVerdict: "VERIFIED" },
          { latex: "25 = x^2 + y^2 + 12", expectedVerdict: "VERIFIED" },
          { latex: "x^2 + y^2 = 13", expectedVerdict: "VERIFIED" }
        ],
        expectedFinalCorrect: true
      },
      {
        label: "missing-cross-term",
        description: "off-by-one because cross term was dropped",
        category: "OFF_BY_ONE",
        steps: [
          { latex: "(x+y)^2 = x^2 + y^2", expectedVerdict: "INVALID" },
          { latex: "x^2 + y^2 = 25", expectedVerdict: "INVALID" }
        ],
        expectedFinalCorrect: false
      }
    ]
  }
];
