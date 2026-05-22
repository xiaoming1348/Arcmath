import { describe, expect, it } from "vitest";
import {
  miniF2FEntriesToFixtures,
  parseMiniF2FFile
} from "@/scripts/grading-eval/minif2f-parser";

const SAMPLE = `import MiniF2F.Minif2fImport

-- Show that for any real x, x^2 is non-negative.
theorem mathd_algebra_001 (x : ℝ) : 0 ≤ x ^ 2 := by
  exact sq_nonneg x

theorem mathd_numbertheory_002 (n : ℕ) (h : n = 3) : n * n = 9 := by
  rw [h]
  norm_num

theorem unsolved_03 (a b : ℕ) (h : a ≤ b) : a ≤ b + 1 := by
  sorry

-- Two-line leading comment.
-- It should fold into a single statement.
theorem mathd_algebra_004 : ∃ x : ℝ, x ^ 2 = 4 := by
  refine ⟨2, ?_⟩
  norm_num
`;

describe("parseMiniF2FFile", () => {
  it("extracts every theorem", () => {
    const entries = parseMiniF2FFile(SAMPLE, "test");
    expect(entries.map((e) => e.name)).toEqual([
      "mathd_algebra_001",
      "mathd_numbertheory_002",
      "unsolved_03",
      "mathd_algebra_004"
    ]);
  });

  it("captures leading comments", () => {
    const entries = parseMiniF2FFile(SAMPLE, "test");
    expect(entries[0].leadingComment).toContain("x^2");
    expect(entries[1].leadingComment).toBeNull();
    expect(entries[3].leadingComment).toContain("Two-line leading comment");
  });

  it("tracks paren depth so := inside parens does not break the scan", () => {
    const tricky = `theorem foo (h : (a := 1) ∧ True) : True := by trivial`;
    const entries = parseMiniF2FFile(tricky, "test");
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("foo");
    expect(entries[0].proofBody).toContain("trivial");
  });

  it("collects multi-line proof bodies", () => {
    const entries = parseMiniF2FFile(SAMPLE, "test");
    const e = entries[0];
    expect(e.proofBody).toContain("exact sq_nonneg x");
  });

  it("flags sorry-only entries", () => {
    const entries = parseMiniF2FFile(SAMPLE, "test");
    const stubs = entries.filter((e) => /^\s*sorry\s*$/.test(e.proofBody));
    expect(stubs.map((s) => s.name)).toEqual(["unsolved_03"]);
  });
});

describe("miniF2FEntriesToFixtures", () => {
  it("makes one fixture per entry with a single critical milestone", () => {
    const entries = parseMiniF2FFile(SAMPLE, "test");
    const fixtures = miniF2FEntriesToFixtures(entries);
    expect(fixtures).toHaveLength(4);
    for (const f of fixtures) {
      expect(f.rubric.milestones).toHaveLength(1);
      expect(f.rubric.milestones[0].critical).toBe(true);
      expect(f.rubric.milestones[0].formal?.kind).toBe("lean4-statement");
      expect(f.rubric.milestones[0].formal?.code).toContain("theorem");
    }
  });

  it("flags sorry entries as ESCALATE rather than VERIFIED", () => {
    const entries = parseMiniF2FFile(SAMPLE, "test");
    const fixtures = miniF2FEntriesToFixtures(entries);
    const stub = fixtures.find((f) => f.key.endsWith("unsolved_03"));
    expect(stub).toBeDefined();
    expect(stub!.studentSolutions[0].expectedFinalCorrect).toBe(false);
    expect(stub!.studentSolutions[0].steps[0].expectedVerdict).toBe(
      "ESCALATE"
    );
  });

  it("tags solved entries as CLEAN_CORRECT VERIFIED", () => {
    const entries = parseMiniF2FFile(SAMPLE, "test");
    const fixtures = miniF2FEntriesToFixtures(entries);
    const solved = fixtures.find((f) => f.key.endsWith("mathd_algebra_001"));
    expect(solved!.studentSolutions[0].category).toBe("CLEAN_CORRECT");
    expect(solved!.studentSolutions[0].steps[0].expectedVerdict).toBe(
      "VERIFIED"
    );
  });
});
