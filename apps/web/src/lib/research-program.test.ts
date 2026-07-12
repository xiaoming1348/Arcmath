import { describe, expect, it } from "vitest";
import { buildResearchProgram } from "@/lib/research-program";

describe("research program planner", () => {
  it("selects accessible high-school targets with verification paths", () => {
    const plan = buildResearchProgram({
      studentLevel: "HIGH_SCHOOL",
      weeks: 8,
      interests: ["number_theory", "counting"],
      skills: {
        number_theory: 3,
        counting: 3,
        proof: 2,
        programming: 2
      },
      maxProblems: 3
    });

    expect(plan.contractVersion).toBe("research_program.v1");
    expect(plan.selectedProblems).toHaveLength(3);
    expect(plan.selectedProblems[0]?.problemId).toBe("floor_sum_count_identity");
    expect(
      plan.selectedProblems.some(
        (problem) => problem.problemId === "numerical_semigroup_fel_stress"
      )
    ).toBe(false);
  });

  it("can select the numerical semigroup stress track for prepared undergrads", () => {
    const plan = buildResearchProgram({
      studentLevel: "UNDERGRAD",
      weeks: 12,
      preferOpen: true,
      interests: ["formalization", "commutative_algebra", "number_theory"],
      skills: {
        algebra: 4,
        proof: 4,
        programming: 3,
        formalization: 3,
        number_theory: 3
      },
      maxProblems: 3
    });

    expect(
      plan.selectedProblems.some(
        (problem) => problem.problemId === "numerical_semigroup_fel_stress"
      )
    ).toBe(true);
    expect(plan.programSequence.at(-1)?.verificationGate).toContain("proved");
  });

  it("keeps an open-stress target visible when undergrads request open projects", () => {
    const plan = buildResearchProgram({
      studentLevel: "UNDERGRAD",
      weeks: 12,
      preferOpen: true,
      interests: ["number_theory", "counting", "formalization"],
      skills: {
        number_theory: 3,
        counting: 3,
        proof: 2,
        programming: 2,
        formalization: 1
      },
      maxProblems: 3
    });

    expect(plan.selectedProblems).toHaveLength(3);
    expect(plan.selectedProblems.at(-1)?.problemId).toBe(
      "numerical_semigroup_fel_stress"
    );
  });
});
