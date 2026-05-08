import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  looksLikeTeacherFormat,
  slugifyForExam,
  teacherProblemSetSchema
} from "./teacher-problem-set-schema";

const baseValid = {
  schemaVersion: SCHEMA_VERSION,
  set: { title: "Homework Week 5 — Inequalities" },
  problems: [
    {
      number: 1,
      statement: "If $a+b=4$, what is max $ab$?",
      answerFormat: "INTEGER",
      answer: "4",
      solutionSketch: "By AM-GM, ab <= 4."
    }
  ]
};

describe("teacherProblemSetSchema", () => {
  it("accepts a minimal valid payload and applies defaults", () => {
    const parsed = teacherProblemSetSchema.parse(baseValid);
    expect(parsed.set.contest).toBe("PRACTICE");
    expect(parsed.set.year).toBe(new Date().getFullYear());
    expect(parsed.set.exam).toBe(slugifyForExam(baseValid.set.title));
    expect(parsed.set.category).toBe("TOPIC_PRACTICE");
    expect(parsed.set.submissionMode).toBe("PER_PROBLEM");
    expect(parsed.set.tutorEnabled).toBe(true);
  });

  it("rejects missing schemaVersion", () => {
    const payload = { ...baseValid, schemaVersion: "wrong" as typeof SCHEMA_VERSION };
    const result = teacherProblemSetSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("requires solutionSketch for PROOF problems", () => {
    const result = teacherProblemSetSchema.safeParse({
      ...baseValid,
      problems: [
        {
          number: 1,
          statement: "Prove that 1+1=2.",
          answerFormat: "PROOF"
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("solutionSketch"))
      ).toBe(true);
    }
  });

  it("forbids answer on PROOF problems", () => {
    const result = teacherProblemSetSchema.safeParse({
      ...baseValid,
      problems: [
        {
          number: 1,
          statement: "Prove that 1+1=2.",
          answerFormat: "PROOF",
          answer: "2",
          solutionSketch: "Trivial."
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it("requires 5 choices for MULTIPLE_CHOICE", () => {
    const result = teacherProblemSetSchema.safeParse({
      ...baseValid,
      problems: [
        {
          number: 1,
          statement: "Pick one.",
          answerFormat: "MULTIPLE_CHOICE",
          answer: "A",
          choices: ["x", "y", "z"]
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it("requires contiguous numbering", () => {
    const result = teacherProblemSetSchema.safeParse({
      ...baseValid,
      problems: [
        {
          number: 1,
          statement: "p1",
          answerFormat: "INTEGER",
          answer: "1"
        },
        {
          number: 3,
          statement: "p3",
          answerFormat: "INTEGER",
          answer: "3"
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it("accepts PROOF problem with solutionSketch and no answer", () => {
    const result = teacherProblemSetSchema.safeParse({
      ...baseValid,
      problems: [
        {
          number: 1,
          statement: "Prove AM-GM for n=2.",
          answerFormat: "PROOF",
          solutionSketch: "(a-b)^2 >= 0 implies a^2+b^2 >= 2ab, etc."
        }
      ]
    });
    expect(result.success).toBe(true);
  });

  it("uses explicit exam when provided", () => {
    const parsed = teacherProblemSetSchema.parse({
      ...baseValid,
      set: { ...baseValid.set, exam: "custom-slug-v2" }
    });
    expect(parsed.set.exam).toBe("custom-slug-v2");
  });

  it("accepts explicit PRACTICE contest + year", () => {
    const parsed = teacherProblemSetSchema.parse({
      ...baseValid,
      set: { ...baseValid.set, contest: "PRACTICE", year: 2024 }
    });
    expect(parsed.set.year).toBe(2024);
  });
});

describe("looksLikeTeacherFormat", () => {
  it("returns true for a teacher-format object", () => {
    expect(looksLikeTeacherFormat(baseValid)).toBe(true);
  });

  it("returns false for contest-import format", () => {
    expect(
      looksLikeTeacherFormat({
        problemSet: { contest: "AMC10", year: 2024, exam: "A" },
        problems: []
      })
    ).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(looksLikeTeacherFormat(null)).toBe(false);
    expect(looksLikeTeacherFormat("hello")).toBe(false);
    expect(looksLikeTeacherFormat([])).toBe(false);
  });
});

describe("slugifyForExam", () => {
  it("lowercases and replaces separators with dashes", () => {
    expect(slugifyForExam("Homework Week 5 — Inequalities")).toBe(
      "homework-week-5-inequalities"
    );
  });

  it("handles non-ASCII characters", () => {
    expect(slugifyForExam("第5周作业")).toBe("5");
  });

  it("caps length", () => {
    const long = "a".repeat(200);
    expect(slugifyForExam(long).length).toBeLessThanOrEqual(48);
  });

  it("falls back to 'untitled' when everything strips away", () => {
    expect(slugifyForExam("!!!")).toBe("untitled");
  });
});
