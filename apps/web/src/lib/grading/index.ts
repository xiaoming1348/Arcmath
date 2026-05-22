/**
 * Public surface for the v2 grading engine. See GRADING_ENGINE_V2.md.
 *
 * Importers should depend on this barrel rather than reaching into
 * individual files; the internal layout will change as Slice B/C land.
 */

export type {
  BackendSource,
  BackendVote,
  EscalationDecision,
  EscalationReason,
  MilestoneCoverageEntry,
  MilestoneStatus,
  ProblemGradingOutcome,
  StepInput,
  StepType,
  StepVerdict,
  StepVerdictOutcome
} from "./types";
export {
  STEP_TYPES,
  STEP_VERDICTS,
  BACKEND_SOURCES,
  ESCALATION_REASONS,
  MILESTONE_STATUSES,
  isDeterministicSource
} from "./types";

export { compareAnswers } from "./answer-equiv";

export { mergeVotes, type MergeOutcome } from "./confidence";
export {
  COMMIT_THRESHOLD,
  decideEscalation,
  type EscalationInput
} from "./escalation";

export type { Backend } from "./backends";
export { fanOut } from "./backends";

export type { StepClassifier, GradeStepDeps } from "./step-pipeline";
export { gradeStep } from "./step-pipeline";

export type { Milestone, Rubric } from "./rubric";
export {
  blockingCriticalMilestones,
  fromStructuredSolution,
  milestoneSchema,
  rubricSchema
} from "./rubric";
