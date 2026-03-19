import { describe, expect, it } from "vitest";
import { selectDiagnosticProblems, type DiagnosticCandidateProblem } from "./diagnostic-pool";

function makeProblem(
  id: string,
  examTrack: "AMC8" | "AMC10" | "AMC12",
  topicKey: string,
  difficultyBand: "EASY" | "MEDIUM" | "HARD",
  problemNumber: number
): DiagnosticCandidateProblem {
  return {
    problemId: id,
    problemSetId: "set-1",
    problemSetTitle: "Test Set",
    problemNumber,
    examTrack,
    topicKey,
    techniqueTags: [],
    difficultyBand,
    diagnosticEligible: true,
    statement: `Problem ${problemNumber}`
  };
}

describe("selectDiagnosticProblems", () => {
  it("selects a full 10-question AMC10 diagnostic when coverage exists", () => {
    const problems: DiagnosticCandidateProblem[] = [
      makeProblem("a1", "AMC10", "algebra.general", "EASY", 1),
      makeProblem("a2", "AMC10", "algebra.general", "MEDIUM", 10),
      makeProblem("g1", "AMC10", "geometry.general", "EASY", 2),
      makeProblem("g2", "AMC10", "geometry.coordinate_geometry", "MEDIUM", 11),
      makeProblem("n1", "AMC10", "number_theory.general", "EASY", 3),
      makeProblem("n2", "AMC10", "number_theory.general", "MEDIUM", 12),
      makeProblem("c1", "AMC10", "counting.general", "EASY", 4),
      makeProblem("c2", "AMC10", "probability.general", "HARD", 21),
      makeProblem("m1", "AMC10", "arithmetic.word_problems", "MEDIUM", 13),
      makeProblem("m2", "AMC10", "geometry.coordinate_geometry", "HARD", 22)
    ];

    const selected = selectDiagnosticProblems("AMC10", problems);

    expect(selected.selectedProblems).toHaveLength(10);
    expect(selected.missingSlots).toHaveLength(0);
  });

  it("reports missing slots when topic coverage is insufficient", () => {
    const problems: DiagnosticCandidateProblem[] = [
      makeProblem("a1", "AMC8", "algebra.general", "EASY", 1),
      makeProblem("g1", "AMC8", "geometry.general", "MEDIUM", 10)
    ];

    const selected = selectDiagnosticProblems("AMC8", problems);

    expect(selected.selectedProblems.length).toBeLessThan(10);
    expect(selected.missingSlots.length).toBeGreaterThan(0);
  });
});

