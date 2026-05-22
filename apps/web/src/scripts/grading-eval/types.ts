/**
 * Gold-set fixture schema. See GRADING_ENGINE_V2.md §7.
 *
 * One fixture = one problem with rubric + several student solutions
 * each tagged with expected per-step verdicts and expected final
 * answer correctness. The harness in `runner.ts` replays each fixture
 * through the v2 pipeline and produces metric counts.
 *
 * Slice C will replace the handcrafted fixture file with imports from
 * miniF2F-lean4 and OlympiadBench. The schema below is stable across
 * those upgrades.
 */

import { z } from "zod";
import { rubricSchema } from "@/lib/grading/rubric";
import { STEP_VERDICTS } from "@/lib/grading/types";

export const studentStepSchema = z.object({
  latex: z.string().min(1),
  expectedVerdict: z.enum([...STEP_VERDICTS, "ESCALATE"] as const)
});

export const studentSolutionSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1).max(240),
  /**
   * Taxonomy from §7.1: clean correct, alt correct, off-by-one, wrong
   * final answer with valid scaffolding, false-but-plausible, totally
   * wrong. We tag each solution so per-category accuracy can be
   * reported.
   */
  category: z.enum([
    "CLEAN_CORRECT",
    "ALT_CORRECT",
    "OFF_BY_ONE",
    "VALID_SCAFFOLD_WRONG_FINAL",
    "FALSE_BUT_PLAUSIBLE",
    "TOTALLY_WRONG"
  ]),
  steps: z.array(studentStepSchema).min(1).max(40),
  /** Expected final-answer correctness (computed from critical milestones). */
  expectedFinalCorrect: z.boolean()
});

export const fixtureSchema = z.object({
  key: z.string().min(1),
  source: z.enum([
    "MINIF2F",
    "OLYMPIAD_BENCH",
    "PUTNAM_BENCH",
    "INTERNAL_AUTHORED"
  ]),
  problemStatement: z.string().min(1),
  rubric: rubricSchema,
  studentSolutions: z.array(studentSolutionSchema).min(1).max(20)
});

export type StudentStepFixture = z.infer<typeof studentStepSchema>;
export type StudentSolutionFixture = z.infer<typeof studentSolutionSchema>;
export type GradingFixture = z.infer<typeof fixtureSchema>;
