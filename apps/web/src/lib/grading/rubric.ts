/**
 * Rubric / Milestone schema for the v2 grader. See GRADING_ENGINE_V2.md §6.
 *
 * Compatible with what `solution-generator.ts` already emits — we wrap
 * that in `fromStructuredSolution()` rather than rewriting the generator.
 */

import { z } from "zod";
import type { StructuredSolution } from "../ai/solution-generator";

const formalSchema = z.object({
  kind: z.literal("lean4-statement"),
  code: z.string().min(1)
});

export const milestoneSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().min(1),
  title: z.string().min(1).max(160),
  claim: z.string().min(1).max(1200),
  techniques: z.array(z.string().min(1).max(80)).max(8).default([]),
  dependsOn: z.array(z.string().min(1)).max(16).default([]),
  critical: z.boolean().default(false),
  formal: formalSchema.optional()
});

export const rubricSchema = z.object({
  problemId: z.string().min(1),
  version: z.string().min(1),
  generatedAt: z.string().min(1),
  source: z.enum(["AUTHORED", "AUTO_GENERATED", "HYBRID_APPROVED"]),
  approvedAt: z.string().nullable().default(null),
  goalStatement: z.string().min(1).max(600),
  milestones: z.array(milestoneSchema).min(1).max(15),
  commonPitfalls: z.array(z.string().min(1).max(240)).max(5).default([])
});

export type Milestone = z.infer<typeof milestoneSchema>;
export type Rubric = z.infer<typeof rubricSchema>;

/**
 * Wrap an existing `StructuredSolution` (the output of the auto-generator)
 * into a v2 Rubric. Marks `critical=true` on the last milestone — the
 * conclusion — and on any milestone whose dependsOn is reached by every
 * later step (a structural "everything depends on this" check).
 */
export function fromStructuredSolution(
  problemId: string,
  s: StructuredSolution
): Rubric {
  const total = s.steps.length;
  const reverseReachable = new Set<number>();
  // Find indices that the final milestone transitively depends on.
  function visit(i: number): void {
    if (reverseReachable.has(i)) return;
    reverseReachable.add(i);
    const node = s.steps.find((x) => x.index === i);
    if (!node) return;
    for (const d of node.dependsOn) visit(d);
  }
  visit(total);

  const milestones: Milestone[] = s.steps.map((step) => {
    const isLast = step.index === total;
    const isOnCriticalPath = reverseReachable.has(step.index);
    return milestoneSchema.parse({
      id: `${problemId}::m${step.index}`,
      index: step.index,
      title: step.title,
      claim: step.claim,
      techniques: step.technique,
      dependsOn: step.dependsOn.map((d) => `${problemId}::m${d}`),
      critical: isLast || isOnCriticalPath
    });
  });

  return rubricSchema.parse({
    problemId,
    version: s.version,
    generatedAt: s.generatedAt,
    source: "AUTO_GENERATED",
    approvedAt: null,
    goalStatement: s.goalStatement,
    milestones,
    commonPitfalls: s.commonPitfalls
  });
}

/**
 * Looks up the milestones that are still "blocking the final answer" —
 * i.e. critical milestones not yet covered. The escalation gate uses this
 * to decide whether a low-confidence step is worth pinging the teacher for
 * or can be silently absorbed.
 */
export function blockingCriticalMilestones(
  rubric: Rubric,
  coveredMilestoneIds: Set<string>
): Milestone[] {
  return rubric.milestones.filter(
    (m) => m.critical && !coveredMilestoneIds.has(m.id)
  );
}
