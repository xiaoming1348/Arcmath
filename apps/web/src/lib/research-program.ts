export type ResearchStudentLevel = "HIGH_SCHOOL" | "UNDERGRAD";

export type ResearchProgramProfile = {
  studentLevel: ResearchStudentLevel;
  weeks: number;
  teamSize: number;
  interests: string[];
  skills: Record<string, number>;
  preferOpen: boolean;
  requireFormalization: boolean;
  maxProblems: number;
};

export type ResearchProblemTemplate = {
  problemId: string;
  title: string;
  problemType: "known_theorem" | "constructed" | "open_stress";
  audience: ResearchStudentLevel[];
  domains: string[];
  difficulty: number;
  minWeeks: number;
  recommendedSkills: Record<string, number>;
  statement: string;
  explorationHooks: string[];
  verificationPath: string[];
  deliverables: string[];
  mathscoutAssets: string[];
};

export type ResearchPhase = {
  phaseId: string;
  title: string;
  weekRange: string;
  objective: string;
  studentActions: string[];
  mentorChecks: string[];
  verificationGate: string;
};

export type SelectedResearchProblem = ResearchProblemTemplate & {
  fitScore: number;
  fitReasons: string[];
  phases: ResearchPhase[];
};

export type ResearchProgramPlan = {
  contractVersion: "research_program.v1";
  profile: ResearchProgramProfile;
  selectedProblems: SelectedResearchProblem[];
  programSequence: ResearchPhase[];
  platformNotes: string[];
};

export const DEFAULT_RESEARCH_PROFILE: ResearchProgramProfile = {
  studentLevel: "HIGH_SCHOOL",
  weeks: 10,
  teamSize: 3,
  interests: ["number_theory", "counting", "formalization"],
  skills: {
    number_theory: 3,
    counting: 3,
    proof: 2,
    programming: 2,
    formalization: 1
  },
  preferOpen: false,
  requireFormalization: true,
  maxProblems: 3
};

export const RESEARCH_PROBLEM_CATALOG: ResearchProblemTemplate[] = [
  {
    problemId: "floor_sum_count_identity",
    title: "Floor-sum count identity",
    problemType: "known_theorem",
    audience: ["HIGH_SCHOOL", "UNDERGRAD"],
    domains: ["number_theory", "counting", "formalization"],
    difficulty: 3,
    minWeeks: 6,
    recommendedSkills: {
      number_theory: 2,
      counting: 2,
      proof: 2,
      programming: 1
    },
    statement:
      "Relate a modular pair count N_k(n) to F_k(n+1)-F_k(n), the finite difference of a floor sum for odd k.",
    explorationHooks: [
      "Draw admissible lattice points for small odd k.",
      "Track which floor-sum terms increase when n changes to n+1.",
      "Build the pair-to-index bijection by hand."
    ],
    verificationPath: [
      "Run finite experiments.",
      "Use counting-bijection and finite-difference method workbenches.",
      "Verify the root Lean theorem.",
      "Run known-proof comparison."
    ],
    deliverables: [
      "Example table and diagram pack",
      "Bijection proof note",
      "Lean proof-status report"
    ],
    mathscoutAssets: [
      "floor_sum_count_identity solver",
      "counting_bijection method",
      "finite_difference_telescoping method",
      "known-proof comparison"
    ]
  },
  {
    problemId: "graph_invariant_game",
    title: "Graph invariant game",
    problemType: "constructed",
    audience: ["HIGH_SCHOOL", "UNDERGRAD"],
    domains: ["graph_theory", "invariants", "counting"],
    difficulty: 2,
    minWeeks: 5,
    recommendedSkills: {
      counting: 2,
      proof: 1,
      programming: 1
    },
    statement:
      "Define a local move on a finite graph and determine which invariants decide whether a target state is reachable.",
    explorationHooks: [
      "Play the move on paths, cycles, and grids.",
      "Record quantities that never change.",
      "Search for a complete invariant in small graphs."
    ],
    verificationPath: [
      "Enumerate small graphs.",
      "Generate a proof DAG for invariant candidates.",
      "Formalize the invariant preservation lemma."
    ],
    deliverables: ["Move simulator", "Invariant proof", "Reachability chart"],
    mathscoutAssets: ["graph experiments", "proof DAG", "finite verifier"]
  },
  {
    problemId: "beatty_partition_explorer",
    title: "Beatty-style partition explorer",
    problemType: "constructed",
    audience: ["HIGH_SCHOOL", "UNDERGRAD"],
    domains: ["number_theory", "sequences", "experimentation"],
    difficulty: 3,
    minWeeks: 6,
    recommendedSkills: {
      number_theory: 2,
      proof: 2,
      programming: 2
    },
    statement:
      "Explore when two floor-generated sequences appear to partition a finite interval, then prove a parameter-restricted version.",
    explorationHooks: [
      "Generate initial terms for rational slope pairs.",
      "Search for overlaps and gaps.",
      "State a finite version that is actually true."
    ],
    verificationPath: [
      "Write overlap/gap checks.",
      "Use sequence tools to detect false patterns.",
      "Formalize a finite-window theorem."
    ],
    deliverables: ["Counterexample gallery", "Finite theorem", "Verifier JSON"],
    mathscoutAssets: ["sequence tools", "experiment templates", "proof DAG"]
  },
  {
    problemId: "generating_function_recurrence_lab",
    title: "Generating-function recurrence lab",
    problemType: "constructed",
    audience: ["HIGH_SCHOOL", "UNDERGRAD"],
    domains: ["generating_functions", "algebra", "sequences"],
    difficulty: 4,
    minWeeks: 8,
    recommendedSkills: {
      algebra: 3,
      proof: 2,
      programming: 2
    },
    statement:
      "Derive a generating function from a recurrence family, predict coefficient identities, and prove one selected identity.",
    explorationHooks: [
      "Generate recurrence tables.",
      "Guess rational generating functions.",
      "Find where a tempting closed form fails."
    ],
    verificationPath: [
      "Run sequence experiments.",
      "Use the coefficient-extraction workbench.",
      "Formalize a coefficient identity."
    ],
    deliverables: [
      "Sequence notebook",
      "Generating-function derivation",
      "Formalized coefficient lemma"
    ],
    mathscoutAssets: [
      "generating_function_coefficient_extraction method",
      "known-proof comparison",
      "Lean scaffold"
    ]
  },
  {
    problemId: "numerical_semigroup_fel_stress",
    title: "Fel-style numerical semigroup stress project",
    problemType: "open_stress",
    audience: ["UNDERGRAD"],
    domains: ["number_theory", "commutative_algebra", "formalization"],
    difficulty: 5,
    minWeeks: 10,
    recommendedSkills: {
      algebra: 4,
      proof: 4,
      programming: 3,
      formalization: 3
    },
    statement:
      "Study a Fel-style identity involving numerical semigroup gaps, Hilbert numerator data, syzygy sums, and coefficient extraction.",
    explorationHooks: [
      "Enumerate small numerical semigroups.",
      "Compare Hilbert numerator coefficients with gap moments.",
      "Track which article-shaped proof tasks remain open."
    ],
    verificationPath: [
      "Run the numerical-semigroup finite verifier.",
      "Generate definition-grounding and generating-function workbenches.",
      "Run known-proof comparison and Level 5 escalation.",
      "Report the root status honestly."
    ],
    deliverables: [
      "Finite evidence report",
      "Definition-fidelity report",
      "Known-proof comparison gap map",
      "Partial Lean artifacts"
    ],
    mathscoutAssets: [
      "numerical_semigroup_fel solver",
      "definition grounding method",
      "generating-function method",
      "progress visualization"
    ]
  }
];

export function buildResearchProgram(
  input: Partial<ResearchProgramProfile> = {}
): ResearchProgramPlan {
  const profile = normalizeProfile(input);
  const rankedProblems = RESEARCH_PROBLEM_CATALOG
    .filter((problem) => problem.audience.includes(profile.studentLevel))
    .filter((problem) => profile.weeks >= problem.minWeeks)
    .map((problem) => {
      const scored = scoreProblem(problem, profile);
      return {
        ...problem,
        fitScore: scored.score,
        fitReasons: scored.reasons,
        phases: buildProblemPhases(problem, profile)
      };
    })
    .sort((a, b) => b.fitScore - a.fitScore);
  const selectedProblems = includePreferredOpenTarget(
    rankedProblems.slice(0, profile.maxProblems),
    rankedProblems,
    profile
  );

  return {
    contractVersion: "research_program.v1",
    profile,
    selectedProblems,
    programSequence: buildProgramSequence(profile),
    platformNotes: [
      "Use this plan as the program spine; weekly logs and verification artifacts should live on the student/team record.",
      "Only root theorem verification can mark a research target solved.",
      "Constructed targets are preferred for first-cycle high school cohorts; open-stress targets are better for advanced undergrad teams."
    ]
  };
}

function includePreferredOpenTarget(
  selectedProblems: SelectedResearchProblem[],
  rankedProblems: SelectedResearchProblem[],
  profile: ResearchProgramProfile
): SelectedResearchProblem[] {
  if (
    !profile.preferOpen ||
    selectedProblems.some((problem) => problem.problemType === "open_stress")
  ) {
    return selectedProblems;
  }

  const preferredOpenTarget = rankedProblems.find(
    (problem) => problem.problemType === "open_stress"
  );
  if (!preferredOpenTarget) return selectedProblems;

  if (selectedProblems.length < profile.maxProblems) {
    return [...selectedProblems, preferredOpenTarget];
  }

  return [
    ...selectedProblems.slice(0, Math.max(0, profile.maxProblems - 1)),
    preferredOpenTarget
  ];
}

function normalizeProfile(
  input: Partial<ResearchProgramProfile>
): ResearchProgramProfile {
  return {
    ...DEFAULT_RESEARCH_PROFILE,
    ...input,
    weeks: clampInt(input.weeks ?? DEFAULT_RESEARCH_PROFILE.weeks, 4, 32),
    teamSize: clampInt(input.teamSize ?? DEFAULT_RESEARCH_PROFILE.teamSize, 1, 8),
    maxProblems: clampInt(
      input.maxProblems ?? DEFAULT_RESEARCH_PROFILE.maxProblems,
      1,
      5
    ),
    interests: input.interests ?? DEFAULT_RESEARCH_PROFILE.interests,
    skills: {
      ...DEFAULT_RESEARCH_PROFILE.skills,
      ...(input.skills ?? {})
    }
  };
}

function scoreProblem(
  problem: ResearchProblemTemplate,
  profile: ResearchProgramProfile
): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];

  if (problem.problemType === "open_stress" && profile.preferOpen) {
    score += 12;
    reasons.push("matches open-ended research preference");
  }
  if (problem.problemType !== "open_stress" && !profile.preferOpen) {
    score += 6;
    reasons.push("suitable constructed/known first-cycle target");
  }

  const interestHits = profile.interests.filter((interest) =>
    problem.domains.includes(interest)
  );
  if (interestHits.length > 0) {
    score += interestHits.length * 7;
    reasons.push(`interest match: ${interestHits.join(", ")}`);
  }

  let skillGap = 0;
  let skillStrength = 0;
  for (const [skill, required] of Object.entries(problem.recommendedSkills)) {
    const have = profile.skills[skill] ?? 2;
    const delta = have - required;
    if (delta >= 0) skillStrength += Math.min(delta + 1, 3);
    else skillGap += Math.abs(delta);
  }
  score += skillStrength * 2;
  score -= skillGap * 5;
  reasons.push(
    skillGap === 0
      ? "current skills are enough to start"
      : skillGap <= 2
        ? "small prerequisite gap"
        : "larger prerequisite gap"
  );

  if (
    profile.requireFormalization &&
    problem.mathscoutAssets.some((asset) =>
      asset.toLowerCase().includes("lean") ||
      asset.toLowerCase().includes("formal") ||
      asset.toLowerCase().includes("verification")
    )
  ) {
    score += 8;
    reasons.push("has MathScout verification path");
  }

  if (problem.difficulty >= 5 && profile.studentLevel === "HIGH_SCHOOL") {
    score -= 10;
    reasons.push("too hard for most first-cycle high school cohorts");
  }

  return { score: Math.round(score * 100) / 100, reasons };
}

function buildProgramSequence(profile: ResearchProgramProfile): ResearchPhase[] {
  return [
    {
      phaseId: "program.orientation",
      title: "Research orientation and tool setup",
      weekRange: "Week 1",
      objective:
        "Set expectations: exploration is allowed, but proof claims need verification.",
      studentActions: [
        "Choose experiment, proof, and exposition roles.",
        "Restate each selected problem in team notation.",
        "Write the first example table by hand."
      ],
      mentorChecks: [
        "Check that students distinguish evidence from proof.",
        "Confirm each team has a clear logging routine."
      ],
      verificationGate:
        "Students can explain experiment evidence, proof skeleton, and Level 5 verification."
    },
    {
      phaseId: "program.midpoint_review",
      title: "Midpoint review and downselection",
      weekRange: `Week ${Math.max(2, Math.floor(profile.weeks / 2))}`,
      objective:
        "Choose the primary research target and archive the others as side explorations.",
      studentActions: [
        "Present examples, failed approaches, and blocker tree.",
        "Pick one primary problem and one fallback."
      ],
      mentorChecks: [
        "Reject claims supported only by bounded computation.",
        "Assign every blocker to a student or mentor."
      ],
      verificationGate:
        "Primary target has a proof plan and a highest-honest verification goal."
    },
    {
      phaseId: "program.final_expo",
      title: "Final exposition and verification report",
      weekRange: `Week ${profile.weeks}`,
      objective:
        "Produce a student-readable paper, presentation, and verification appendix.",
      studentActions: [
        "Write the final explanation for peers.",
        "Separate proved results, conjectures, evidence, and blockers.",
        "Prepare a short MathScout artifact demo."
      ],
      mentorChecks: [
        "Audit every claim against verification status.",
        "Confirm unresolved gaps are described as future work."
      ],
      verificationGate:
        "Final report states exactly what is proved, checked, or still open."
    }
  ];
}

function buildProblemPhases(
  problem: ResearchProblemTemplate,
  profile: ResearchProgramProfile
): ResearchPhase[] {
  return [
    {
      phaseId: `${problem.problemId}.foundations`,
      title: "Prerequisite map",
      weekRange: "Weeks 1-2",
      objective:
        "Turn the statement into definitions, examples, and prerequisite mini-lessons.",
      studentActions: [
        "List every object and assumption.",
        "Work five small examples by hand.",
        "Create a glossary for the team."
      ],
      mentorChecks: [
        "Ask why each assumption is needed.",
        "Check that examples include edge cases."
      ],
      verificationGate:
        "Team can generate correct examples and identify the target claim."
    },
    {
      phaseId: `${problem.problemId}.experiments`,
      title: "Experiments and pattern search",
      weekRange: `Weeks 2-${Math.max(3, Math.floor(profile.weeks / 3))}`,
      objective:
        "Find patterns with computation while separating evidence from proof.",
      studentActions: [
        "Design parameters before running experiments.",
        "Record one failed pattern.",
        "Turn patterns into candidate lemmas."
      ],
      mentorChecks: [
        "Watch for overfitting to small cases.",
        "Translate experiment output into mathematical language."
      ],
      verificationGate:
        "Experiments support named lemmas rather than only a guess."
    },
    {
      phaseId: `${problem.problemId}.formalization`,
      title: "Formalization and honest status",
      weekRange: `Weeks ${Math.max(5, Math.floor((2 * profile.weeks) / 3))}-${profile.weeks}`,
      objective:
        "Convert the strongest proof path into a checked artifact or honest partial report.",
      studentActions: [
        "Formalize definitions before final theorem.",
        "Keep Lean/tool error notes.",
        "Write a limitation paragraph if Level 5 is not reached."
      ],
      mentorChecks: [
        "Do not count unrelated verified snippets as root proof.",
        "Check final status against MathScout output."
      ],
      verificationGate:
        problem.verificationPath[problem.verificationPath.length - 1] ??
        "Highest honest verification status is recorded."
    }
  ];
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
