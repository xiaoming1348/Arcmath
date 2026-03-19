export type ExamTrack = "AMC8" | "AMC10" | "AMC12";

export type DifficultyBand = "EASY" | "MEDIUM" | "HARD";

export type DiagnosticTechniqueTag =
  | "algebra_setup"
  | "pattern_finding"
  | "equation_solving"
  | "ratio_reasoning"
  | "diagram_reading"
  | "spatial_visualization"
  | "area_volume_modeling"
  | "angle_chasing"
  | "coordinate_modeling"
  | "casework"
  | "counting_principle"
  | "probability_setup"
  | "modular_reasoning"
  | "divisibility_reasoning"
  | "working_backwards"
  | "estimation"
  | "function_analysis"
  | "trigonometric_modeling"
  | "symmetry"
  | "optimization";

export type DiagnosticTopicBlueprint = {
  key: string;
  label: string;
  description: string;
  primaryTopicPrefixes: string[];
  targetQuestionCount: number;
  subtopics: string[];
  coreTechniques: DiagnosticTechniqueTag[];
};

export type DiagnosticExamBlueprint = {
  exam: ExamTrack;
  title: string;
  officialScopeSummary: string;
  sourceNotes: string[];
  topicCoverageGoal: string;
  questionCount: number;
  difficultyMix: Record<DifficultyBand, number>;
  placementBands: string[];
  topics: DiagnosticTopicBlueprint[];
  reportFocus: string[];
};

// These blueprints combine:
// 1. official MAA scope statements for AMC 8/10/12
// 2. the repository's current topicKey taxonomy
// 3. pragmatic tutoring needs for diagnostic reporting
//
// They are intentionally coarse. A 10-question diagnostic can cover every
// first-level topic area, but not every fine-grained subskill exhaustively.
export const DIAGNOSTIC_EXAM_BLUEPRINTS: Record<ExamTrack, DiagnosticExamBlueprint> = {
  AMC8: {
    exam: "AMC8",
    title: "AMC 8 Diagnostic",
    officialScopeSummary:
      "Middle-school problem solving: counting and probability, estimation, proportional reasoning, elementary geometry, spatial visualization, graphs and tables, with some beginning algebra and coordinate geometry in later problems.",
    sourceNotes: [
      "MAA AMC official competition page: AMC 8 description",
      "Current repo topicKey taxonomy and live AMC8 real-import corpus"
    ],
    topicCoverageGoal:
      "Cover every major AMC 8 content family at least once, while balancing arithmetic/algebra, geometry/visual reasoning, and counting/probability.",
    questionCount: 10,
    difficultyMix: {
      EASY: 4,
      MEDIUM: 4,
      HARD: 2
    },
    placementBands: ["Foundation", "Developing", "Advancing", "Competitive"],
    topics: [
      {
        key: "arithmetic-proportional",
        label: "Arithmetic, Ratios, and Percent",
        description:
          "Numerical fluency with fractions, percents, rates, proportional reasoning, and straightforward word problems.",
        primaryTopicPrefixes: ["arithmetic.", "algebra.general"],
        targetQuestionCount: 2,
        subtopics: [
          "fractions and percents",
          "ratio and rate reasoning",
          "unit conversion",
          "proportional reasoning"
        ],
        coreTechniques: ["ratio_reasoning", "working_backwards", "estimation"]
      },
      {
        key: "intro-algebra",
        label: "Beginning Algebra and Patterns",
        description:
          "Expression manipulation, simple equations, pattern rules, and elementary coordinate interpretation.",
        primaryTopicPrefixes: ["algebra.", "geometry.coordinate_geometry"],
        targetQuestionCount: 2,
        subtopics: [
          "one-variable equations",
          "expression evaluation",
          "pattern extension",
          "basic coordinate geometry"
        ],
        coreTechniques: ["algebra_setup", "equation_solving", "pattern_finding"]
      },
      {
        key: "geometry-visual",
        label: "Geometry and Spatial Visualization",
        description:
          "Elementary geometry, perimeter/area/volume, geometric decomposition, and figure interpretation.",
        primaryTopicPrefixes: ["geometry."],
        targetQuestionCount: 2,
        subtopics: [
          "perimeter and area",
          "Pythagorean theorem",
          "composite figures",
          "nets and solids",
          "diagram reasoning"
        ],
        coreTechniques: ["diagram_reading", "spatial_visualization", "area_volume_modeling"]
      },
      {
        key: "counting-probability",
        label: "Counting and Probability",
        description:
          "Systematic counting, simple probability, and outcome organization without advanced formalism.",
        primaryTopicPrefixes: ["counting.", "probability."],
        targetQuestionCount: 2,
        subtopics: [
          "organized counting",
          "permutations and selections",
          "simple probability",
          "case counting"
        ],
        coreTechniques: ["casework", "counting_principle", "probability_setup"]
      },
      {
        key: "data-graphs-tables",
        label: "Graphs, Tables, and Data Interpretation",
        description:
          "Interpreting visual data displays and extracting quantitative relationships from graphs and tables.",
        primaryTopicPrefixes: ["arithmetic.", "counting.", "geometry."],
        targetQuestionCount: 2,
        subtopics: [
          "tables and schedules",
          "bar and pie graphs",
          "data extraction",
          "multi-step visual word problems"
        ],
        coreTechniques: ["diagram_reading", "estimation", "working_backwards"]
      }
    ],
    reportFocus: [
      "numerical fluency versus visual reasoning",
      "counting/probability setup quality",
      "whether the student is ready to move from arithmetic-heavy work into broader AMC 8 mixed sets"
    ]
  },
  AMC10: {
    exam: "AMC10",
    title: "AMC 10 Diagnostic",
    officialScopeSummary:
      "Elementary algebra, basic geometry, area and volume formulas, elementary number theory, and elementary probability. Trigonometry, advanced algebra, and advanced geometry are excluded.",
    sourceNotes: [
      "MAA AMC official competition page: AMC 10 description",
      "Current repo topicKey taxonomy and live AMC10 real-import corpus"
    ],
    topicCoverageGoal:
      "Cover all major AMC 10 content areas while distinguishing whether weakness comes from algebraic setup, geometric modeling, or combinatorial reasoning.",
    questionCount: 10,
    difficultyMix: {
      EASY: 4,
      MEDIUM: 4,
      HARD: 2
    },
    placementBands: ["Foundation", "Developing", "Competitive", "AIME-track"],
    topics: [
      {
        key: "algebra-functions",
        label: "Algebra and Functional Reasoning",
        description:
          "Equations, expressions, linear/quadratic reasoning, and functional relationships within non-advanced algebra.",
        primaryTopicPrefixes: ["algebra.", "arithmetic.word_problems"],
        targetQuestionCount: 2,
        subtopics: [
          "linear equations",
          "quadratic structure",
          "algebraic manipulation",
          "function evaluation and patterning"
        ],
        coreTechniques: ["algebra_setup", "equation_solving", "function_analysis"]
      },
      {
        key: "geometry-measurement",
        label: "Geometry and Measurement",
        description:
          "Plane geometry, area/volume, similarity, and clean diagram modeling without trigonometry.",
        primaryTopicPrefixes: ["geometry.general", "geometry.coordinate_geometry"],
        targetQuestionCount: 2,
        subtopics: [
          "angles and polygons",
          "triangles and circles",
          "area and volume",
          "similarity",
          "coordinate geometry"
        ],
        coreTechniques: ["diagram_reading", "angle_chasing", "area_volume_modeling", "coordinate_modeling"]
      },
      {
        key: "number-theory",
        label: "Elementary Number Theory",
        description:
          "Divisibility, factors, remainders, parity, and modular-style reasoning at AMC 10 depth.",
        primaryTopicPrefixes: ["number_theory."],
        targetQuestionCount: 2,
        subtopics: [
          "divisibility and factors",
          "remainders",
          "parity",
          "digit constraints"
        ],
        coreTechniques: ["divisibility_reasoning", "modular_reasoning", "pattern_finding"]
      },
      {
        key: "counting-probability",
        label: "Counting and Probability",
        description:
          "Structured counting, arrangements, selections, and probability setup.",
        primaryTopicPrefixes: ["counting.", "probability."],
        targetQuestionCount: 2,
        subtopics: [
          "arrangements",
          "combinations",
          "casework",
          "probability setup"
        ],
        coreTechniques: ["casework", "counting_principle", "probability_setup", "working_backwards"]
      },
      {
        key: "modeling-word-problems",
        label: "Coordinate and Word-Problem Modeling",
        description:
          "Translate mixed verbal problems into clean equations, diagrams, or coordinate models.",
        primaryTopicPrefixes: [
          "arithmetic.word_problems",
          "geometry.coordinate_geometry",
          "algebra.general"
        ],
        targetQuestionCount: 2,
        subtopics: [
          "rate/work problems",
          "coordinate setup",
          "piecewise case interpretation",
          "multi-step algebraic modeling"
        ],
        coreTechniques: ["algebra_setup", "coordinate_modeling", "working_backwards"]
      }
    ],
    reportFocus: [
      "which AMC 10 pillars are unstable at medium difficulty",
      "whether the student should reinforce fundamentals or move into AIME-style harder mixed sets",
      "whether combinatorics/probability or geometry is the current bottleneck"
    ]
  },
  AMC12: {
    exam: "AMC12",
    title: "AMC 12 Diagnostic",
    officialScopeSummary:
      "Full high-school mathematics curriculum including trigonometry, advanced algebra, and advanced geometry. Calculus is excluded.",
    sourceNotes: [
      "MAA AMC official competition page: AMC 12 description",
      "Current repo topicKey taxonomy and live AMC12 real-import corpus"
    ],
    topicCoverageGoal:
      "Cover all major AMC 12 content families while identifying whether the student is blocked by advanced algebra, trig/geometry, or olympiad-style counting and number theory.",
    questionCount: 10,
    difficultyMix: {
      EASY: 4,
      MEDIUM: 4,
      HARD: 2
    },
    placementBands: ["Foundation", "Developing", "Competitive", "AIME-track"],
    topics: [
      {
        key: "advanced-algebra",
        label: "Advanced Algebra and Functions",
        description:
          "Polynomial structure, functional equations, advanced algebraic manipulation, and richer equation systems.",
        primaryTopicPrefixes: ["algebra."],
        targetQuestionCount: 2,
        subtopics: [
          "polynomials",
          "functional equations",
          "systems and substitutions",
          "advanced manipulation"
        ],
        coreTechniques: ["algebra_setup", "equation_solving", "function_analysis", "optimization"]
      },
      {
        key: "geometry-coordinate",
        label: "Geometry and Coordinate Geometry",
        description:
          "Plane geometry, coordinate geometry, transformations, and higher-complexity diagram modeling.",
        primaryTopicPrefixes: ["geometry.general", "geometry.coordinate_geometry"],
        targetQuestionCount: 2,
        subtopics: [
          "triangle and circle geometry",
          "transformations",
          "analytic geometry",
          "area and length optimization"
        ],
        coreTechniques: ["diagram_reading", "angle_chasing", "coordinate_modeling", "symmetry"]
      },
      {
        key: "trigonometry",
        label: "Trigonometry",
        description:
          "Trig identities, angle relationships, and triangle modeling that are excluded from AMC 10 but expected on AMC 12.",
        primaryTopicPrefixes: ["trigonometry."],
        targetQuestionCount: 2,
        subtopics: [
          "basic identities",
          "special angles",
          "triangle trigonometry",
          "trig-based equation setup"
        ],
        coreTechniques: ["trigonometric_modeling", "diagram_reading", "algebra_setup"]
      },
      {
        key: "number-theory",
        label: "Number Theory",
        description:
          "Remainders, modular constraints, factorization, and higher-structure integer reasoning.",
        primaryTopicPrefixes: ["number_theory."],
        targetQuestionCount: 2,
        subtopics: [
          "modular arithmetic",
          "divisibility",
          "integer structure",
          "digit and parity constraints"
        ],
        coreTechniques: ["modular_reasoning", "divisibility_reasoning", "pattern_finding"]
      },
      {
        key: "counting-probability",
        label: "Counting and Probability",
        description:
          "Casework-heavy combinatorics, structured counting, and probability with more advanced setup than AMC 10.",
        primaryTopicPrefixes: ["counting.", "probability."],
        targetQuestionCount: 2,
        subtopics: [
          "casework",
          "arrangements and selections",
          "inclusion-style counting",
          "probability setup"
        ],
        coreTechniques: ["casework", "counting_principle", "probability_setup", "working_backwards", "symmetry"]
      }
    ],
    reportFocus: [
      "whether the student is genuinely AMC 12-ready or still AMC 10-strong but AMC 12-weak",
      "whether trig/advanced algebra is the main blocker",
      "whether hard-counting and number theory are suppressing top-end performance"
    ]
  }
};

export function getDiagnosticBlueprint(exam: ExamTrack): DiagnosticExamBlueprint {
  return DIAGNOSTIC_EXAM_BLUEPRINTS[exam];
}
