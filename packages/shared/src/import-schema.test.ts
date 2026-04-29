import { describe, expect, it } from "vitest";
import { importProblemSetSchema } from "./import-schema";

function makeProblem(number: number) {
  return {
    number,
    statement: `Problem ${number} statement`,
    statementFormat: "MARKDOWN_LATEX" as const,
    choices: ["1", "2", "3", "4", "5"],
    answer: "A",
    answerFormat: "MULTIPLE_CHOICE" as const
  };
}

function makeBasePayload() {
  return {
    problemSet: {
      contest: "AMC10" as const,
      year: 2022,
      exam: "a"
    },
    problems: Array.from({ length: 25 }, (_, index) => makeProblem(index + 1))
  };
}

describe("importProblemSetSchema", () => {
  it("normalizes exam and accepts a valid canonical contest payload", () => {
    const parsed = importProblemSetSchema.safeParse(makeBasePayload());

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.problemSet.exam).toBe("A");
    }
  });

  it("rejects lowercase difficultyBand and accepts uppercase only", () => {
    const invalid = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: [
        {
          ...makeProblem(1),
          difficultyBand: "easy"
        },
        ...makeBasePayload().problems.slice(1)
      ]
    });
    const valid = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: [
        {
          ...makeProblem(1),
          difficultyBand: "EASY"
        },
        ...makeBasePayload().problems.slice(1)
      ]
    });

    expect(invalid.success).toBe(false);
    expect(valid.success).toBe(true);
  });

  it("rejects invalid exact problem counts", () => {
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: makeBasePayload().problems.slice(0, 24)
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects non-contiguous numbering", () => {
    const problems = makeBasePayload().problems.map((problem) =>
      problem.number === 10 ? { ...problem, number: 11 } : problem
    );
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid multiple-choice payloads", () => {
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: [
        {
          ...makeProblem(1),
          answer: "F",
          choices: ["1", "2", "3", "4"]
        },
        ...makeBasePayload().problems.slice(1)
      ]
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid integer payloads", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "AIME" as const,
        year: 2021,
        exam: "I"
      },
      problems: Array.from({ length: 15 }, (_, index) => ({
        number: index + 1,
        statement: `AIME problem ${index + 1}`,
        answer: index === 0 ? "0042" : "42",
        answerFormat: "INTEGER" as const,
        choices: index === 0 ? undefined : undefined
      }))
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid expression payloads", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "AIME" as const,
        year: 2021,
        exam: "II"
      },
      problems: Array.from({ length: 15 }, (_, index) => ({
        number: index + 1,
        statement: `AIME problem ${index + 1}`,
        answer: "x+1",
        answerFormat: "EXPRESSION" as const,
        choices: index === 0 ? ["bad"] : undefined
      }))
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts optional problem diagram metadata when valid", () => {
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: [
        {
          ...makeProblem(1),
          diagramImageUrl: "https://example.com/problem-1-diagram.png",
          diagramImageAlt: "Triangle ABC with points D, E, and F marked."
        },
        ...makeBasePayload().problems.slice(1)
      ]
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts diagnostic metadata when valid", () => {
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: [
        {
          ...makeProblem(1),
          examTrack: "AMC10",
          techniqueTags: ["algebra_setup", "equation_solving"],
          diagnosticEligible: true
        },
        ...makeBasePayload().problems.slice(1)
      ]
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects diagnostic examTrack that does not match the problem set contest", () => {
    const parsed = importProblemSetSchema.safeParse({
      ...makeBasePayload(),
      problems: [
        {
          ...makeProblem(1),
          examTrack: "AMC8"
        },
        ...makeBasePayload().problems.slice(1)
      ]
    });

    expect(parsed.success).toBe(false);
  });

  // ---------------------------------------------------------------------
  // Admissions-track expansion: Euclid (CEMC), MAT (Oxford + Imperial),
  // STEP (Cambridge), plus USAMO and the new WORKED_SOLUTION format.
  // The 2026-Q2 pilot wiring added these — see schema.prisma comments
  // and packages/db/prisma/migrations/20260424100000_*.
  // ---------------------------------------------------------------------

  it("accepts a well-formed USAMO payload (6 proof/worked-solution problems, no exam)", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "USAMO" as const,
        year: 2024
      },
      problems: Array.from({ length: 6 }, (_, index) => ({
        number: index + 1,
        statement: `USAMO ${2024} problem ${index + 1} — show that…`,
        answerFormat: "WORKED_SOLUTION" as const,
        solutionSketch: `Official solution for problem ${index + 1}.`
      }))
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.problemSet.exam).toBeNull();
    }
  });

  it("rejects USAMO payloads that set an exam variant", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "USAMO" as const,
        year: 2024,
        exam: "I"
      },
      problems: Array.from({ length: 6 }, (_, index) => ({
        number: index + 1,
        statement: `USAMO problem ${index + 1}`,
        answerFormat: "WORKED_SOLUTION" as const,
        solutionSketch: `Official solution ${index + 1}.`
      }))
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts a well-formed Euclid payload (10 integer/expression problems, no exam)", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "EUCLID" as const,
        year: 2024
      },
      problems: Array.from({ length: 10 }, (_, index) => ({
        number: index + 1,
        statement: `Euclid 2024 problem ${index + 1}`,
        answer: String(index + 7),
        answerFormat: "INTEGER" as const
      }))
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.problemSet.exam).toBeNull();
    }
  });

  it("rejects Euclid payloads with the wrong problem count", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "EUCLID" as const,
        year: 2024
      },
      problems: Array.from({ length: 9 }, (_, index) => ({
        number: index + 1,
        statement: `Euclid problem ${index + 1}`,
        answer: "1",
        answerFormat: "INTEGER" as const
      }))
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts a MAT payload with a relaxed problem count and no exam variant", () => {
    // MAT Q1 is 10 MC subparts (flattened to problems 1–10), then Q2–Q7
    // are long worked-solution questions (11–16). Relaxed count path —
    // no expectedCount check fires.
    const mcSubparts = Array.from({ length: 10 }, (_, index) => ({
      number: index + 1,
      statement: `MAT Q1(${String.fromCharCode(97 + index)}) subpart statement`,
      answer: "A",
      answerFormat: "MULTIPLE_CHOICE" as const,
      choices: ["A", "B", "C", "D", "E"]
    }));
    const longQuestions = Array.from({ length: 6 }, (_, index) => ({
      number: 11 + index,
      statement: `MAT Q${index + 2} long question statement`,
      answerFormat: "WORKED_SOLUTION" as const,
      solutionSketch: `Official solution to Q${index + 2}.`
    }));
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "MAT" as const,
        year: 2024
      },
      problems: [...mcSubparts, ...longQuestions]
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.problemSet.exam).toBeNull();
    }
  });

  it("rejects MAT payloads that set an exam variant", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "MAT" as const,
        year: 2024,
        exam: "A"
      },
      problems: [
        {
          number: 1,
          statement: "MAT Q1",
          answer: "A",
          answerFormat: "MULTIPLE_CHOICE" as const,
          choices: ["A", "B", "C", "D", "E"]
        }
      ]
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts a well-formed STEP payload with exam I/II/III", () => {
    // STEP papers each have 12 questions; students pick 6. Relaxed-count
    // path means we don't enforce the 12 here, just that numbering is
    // contiguous starting at 1.
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "STEP" as const,
        year: 2024,
        exam: "II"
      },
      problems: Array.from({ length: 12 }, (_, index) => ({
        number: index + 1,
        statement: `STEP II 2024 Q${index + 1} statement`,
        answerFormat: "WORKED_SOLUTION" as const,
        solutionSketch: `Official solution to Q${index + 1}.`
      }))
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.problemSet.exam).toBe("II");
    }
  });

  it("rejects STEP payloads that omit the exam variant", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "STEP" as const,
        year: 2024
      },
      problems: [
        {
          number: 1,
          statement: "STEP Q1",
          answerFormat: "WORKED_SOLUTION" as const,
          solutionSketch: "Official solution."
        }
      ]
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts STEP I (historical) for the 2016–2020 archive", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "STEP" as const,
        year: 2019,
        exam: "I"
      },
      problems: [
        {
          number: 1,
          statement: "STEP I 2019 Q1",
          answerFormat: "WORKED_SOLUTION" as const,
          solutionSketch: "Official solution."
        }
      ]
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects WORKED_SOLUTION problems missing solutionSketch", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "USAMO" as const,
        year: 2024
      },
      problems: Array.from({ length: 6 }, (_, index) => ({
        number: index + 1,
        statement: `USAMO problem ${index + 1}`,
        answerFormat: "WORKED_SOLUTION" as const
        // intentionally omit solutionSketch
      }))
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects WORKED_SOLUTION problems that include MC choices", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "MAT" as const,
        year: 2024
      },
      problems: [
        {
          number: 1,
          statement: "MAT long question",
          answerFormat: "WORKED_SOLUTION" as const,
          solutionSketch: "Official solution",
          choices: ["A", "B", "C", "D", "E"]
        }
      ]
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects non-WORKED_SOLUTION problems that omit an answer", () => {
    const parsed = importProblemSetSchema.safeParse({
      problemSet: {
        contest: "EUCLID" as const,
        year: 2024
      },
      problems: Array.from({ length: 10 }, (_, index) => ({
        number: index + 1,
        statement: `Euclid problem ${index + 1}`,
        // answer intentionally omitted on an INTEGER format
        answerFormat: "INTEGER" as const
      }))
    });

    expect(parsed.success).toBe(false);
  });
});
