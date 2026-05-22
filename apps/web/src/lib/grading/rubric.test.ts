import { describe, expect, it } from "vitest";
import {
  blockingCriticalMilestones,
  fromStructuredSolution
} from "@/lib/grading/rubric";
import type { StructuredSolution } from "@/lib/ai/solution-generator";

const sampleSolution: StructuredSolution = {
  version: "test-v1",
  generatedAt: "2026-05-10T00:00:00.000Z",
  model: "test-model",
  goalType: "INEQUALITY",
  goalStatement: "Prove that a^2 + b^2 ≥ 2ab",
  steps: [
    {
      index: 1,
      title: "Square is non-negative",
      claim: "(a-b)^2 ≥ 0",
      justification: "any real squared is non-negative",
      technique: ["SOS"],
      dependsOn: []
    },
    {
      index: 2,
      title: "Expand",
      claim: "a^2 - 2ab + b^2 ≥ 0",
      justification: "expand (a-b)^2",
      technique: ["expansion"],
      dependsOn: [1]
    },
    {
      index: 3,
      title: "Rearrange",
      claim: "a^2 + b^2 ≥ 2ab",
      justification: "add 2ab to both sides",
      technique: ["rearrangement"],
      dependsOn: [2]
    }
  ],
  keyInsights: ["spot the (a-b)^2 form"],
  commonPitfalls: ["claiming AM-GM without justification"]
};

describe("fromStructuredSolution", () => {
  it("converts a sketch to a v2 rubric", () => {
    const rubric = fromStructuredSolution("p1", sampleSolution);
    expect(rubric.problemId).toBe("p1");
    expect(rubric.milestones).toHaveLength(3);
    expect(rubric.milestones[0].id).toBe("p1::m1");
    expect(rubric.source).toBe("AUTO_GENERATED");
    expect(rubric.approvedAt).toBeNull();
  });

  it("flags the final milestone and its full dependency chain as critical", () => {
    const rubric = fromStructuredSolution("p1", sampleSolution);
    // All three are on the critical path here.
    for (const m of rubric.milestones) {
      expect(m.critical).toBe(true);
    }
  });

  it("marks side-quest milestones as non-critical", () => {
    const branchy: StructuredSolution = {
      ...sampleSolution,
      steps: [
        {
          index: 1,
          title: "main lemma",
          claim: "X holds",
          justification: "j",
          technique: [],
          dependsOn: []
        },
        {
          index: 2,
          title: "side note",
          claim: "Y holds",
          justification: "j",
          technique: [],
          dependsOn: []
        },
        {
          index: 3,
          title: "conclude",
          claim: "Z",
          justification: "from 1",
          technique: [],
          dependsOn: [1]
        }
      ]
    };
    const rubric = fromStructuredSolution("p2", branchy);
    const ids = rubric.milestones.map((m) => `${m.index}:${m.critical}`);
    // Index 2 is not on the path to the final claim — should be non-critical.
    expect(ids).toContain("2:false");
    expect(ids).toContain("1:true");
    expect(ids).toContain("3:true");
  });
});

describe("blockingCriticalMilestones", () => {
  it("returns critical milestones not yet covered", () => {
    const rubric = fromStructuredSolution("p1", sampleSolution);
    const blocking = blockingCriticalMilestones(
      rubric,
      new Set(["p1::m1"])
    );
    expect(blocking.map((m) => m.id)).toEqual(["p1::m2", "p1::m3"]);
  });

  it("returns empty when all critical milestones covered", () => {
    const rubric = fromStructuredSolution("p1", sampleSolution);
    const blocking = blockingCriticalMilestones(
      rubric,
      new Set(["p1::m1", "p1::m2", "p1::m3"])
    );
    expect(blocking).toEqual([]);
  });
});
