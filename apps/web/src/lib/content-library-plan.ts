export type ExamTrack = "AMC8" | "AMC10" | "AMC12";

export type DifficultyBand = "EASY" | "MEDIUM" | "HARD";

export type DiagnosticStage = "EARLY" | "MID" | "LATE";

export type LibrarySetCategory = "DIAGNOSTIC" | "REAL_EXAM" | "TOPIC_PRACTICE";

export type DiagnosticStagePlan = {
  stage: DiagnosticStage;
  label: string;
  questionCount: number;
  difficultyMix: Record<DifficultyBand, number>;
  goal: string;
};

export type TopicPracticePlan = {
  exam: ExamTrack;
  questionCountRange: [number, number];
  difficultyRatio: {
    EASY: number;
    MEDIUM: number;
    HARD: number;
  };
  exampleTracks: string[];
};

export const DIAGNOSTIC_STAGE_PLANS: Record<DiagnosticStage, DiagnosticStagePlan> = {
  EARLY: {
    stage: "EARLY",
    label: "Preparation Start",
    questionCount: 15,
    difficultyMix: {
      EASY: 7,
      MEDIUM: 6,
      HARD: 2
    },
    goal: "Measure baseline readiness before structured prep starts, while still covering every major topic family once."
  },
  MID: {
    stage: "MID",
    label: "Preparation Middle",
    questionCount: 15,
    difficultyMix: {
      EASY: 5,
      MEDIUM: 6,
      HARD: 4
    },
    goal: "Measure whether foundational gaps are closing and whether the student can sustain medium-difficulty work across the full exam scope."
  },
  LATE: {
    stage: "LATE",
    label: "Preparation Late",
    questionCount: 15,
    difficultyMix: {
      EASY: 3,
      MEDIUM: 6,
      HARD: 6
    },
    goal: "Measure contest readiness under harder mixed conditions close to the target exam."
  }
};

export const DIAGNOSTIC_PROGRAM_PLAN: Record<ExamTrack, { targetSets: number; stages: DiagnosticStage[] }> = {
  AMC8: {
    targetSets: 3,
    stages: ["EARLY", "MID", "LATE"]
  },
  AMC10: {
    targetSets: 3,
    stages: ["EARLY", "MID", "LATE"]
  },
  AMC12: {
    targetSets: 3,
    stages: ["EARLY", "MID", "LATE"]
  }
};

export const REAL_EXAM_LIBRARY_PLAN = {
  contests: ["AMC8", "AMC10", "AMC12", "AIME"] as const,
  yearFrom: 2015,
  reviewRequirements: [
    "statement display",
    "choice display",
    "diagram/image coverage",
    "answer correctness",
    "hint correctness",
    "whole-set submit flow"
  ]
};

export const TOPIC_PRACTICE_LIBRARY_PLAN: TopicPracticePlan[] = [
  {
    exam: "AMC8",
    questionCountRange: [15, 20],
    difficultyRatio: {
      EASY: 4,
      MEDIUM: 3,
      HARD: 3
    },
    exampleTracks: [
      "remainders and divisibility",
      "fractions, ratios, and percents",
      "angles, area, and perimeter",
      "counting and probability"
    ]
  },
  {
    exam: "AMC10",
    questionCountRange: [15, 20],
    difficultyRatio: {
      EASY: 4,
      MEDIUM: 3,
      HARD: 3
    },
    exampleTracks: [
      "number theory remainders",
      "circle geometry",
      "counting and casework",
      "algebraic manipulation and equations"
    ]
  },
  {
    exam: "AMC12",
    questionCountRange: [15, 20],
    difficultyRatio: {
      EASY: 4,
      MEDIUM: 3,
      HARD: 3
    },
    exampleTracks: [
      "trigonometric equations",
      "polynomials and functions",
      "advanced counting",
      "circle and coordinate geometry"
    ]
  }
];
