import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STEP_MANIFEST_DIR, loadAllStepManifests, loadStepManifest } from "./load-manifest";

describe("loadStepManifest", () => {
  it("loads the bundled STEP II 2020 manifest and validates it against the import schema", async () => {
    const result = await loadStepManifest(path.resolve(STEP_MANIFEST_DIR, "step-2020-II.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.problemSet.contest).toBe("STEP");
    expect(result.data.problemSet.year).toBe(2020);
    expect(result.data.problemSet.exam).toBe("II");
    // Every STEP problem ships as WORKED_SOLUTION — confirm that the
    // MVP paper respects that invariant.
    for (const problem of result.data.problems) {
      expect(problem.answerFormat).toBe("WORKED_SOLUTION");
      expect(problem.solutionSketch).toBeDefined();
    }
  });
});

describe("loadAllStepManifests", () => {
  let scratchDir: string;

  beforeEach(async () => {
    scratchDir = await mkdtemp(path.resolve(tmpdir(), "ingest-step-"));
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it("returns one entry per .json file, ordered by filename", async () => {
    // Minimal STEP-shaped manifests — one problem each, WORKED_SOLUTION.
    const makeMiniPaper = (year: number, exam: "I" | "II" | "III") => ({
      problemSet: { contest: "STEP" as const, year, exam },
      problems: [
        {
          number: 1,
          statement: `STEP ${exam} ${year} placeholder Q1 — show that $x^2 \\geq 0$ for all real $x$.`,
          answerFormat: "WORKED_SOLUTION" as const,
          solutionSketch: "Any real $x$ has $x^2 = x \\cdot x \\geq 0$ because the product of two reals of the same sign is non-negative."
        }
      ]
    });
    await writeFile(
      path.resolve(scratchDir, "step-2019-II.json"),
      JSON.stringify(makeMiniPaper(2019, "II")),
      "utf8"
    );
    await writeFile(
      path.resolve(scratchDir, "step-2020-III.json"),
      JSON.stringify(makeMiniPaper(2020, "III")),
      "utf8"
    );

    const results = await loadAllStepManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(true);
    if (results[0].ok && results[1].ok) {
      expect(results[0].data.problemSet.exam).toBe("II");
      expect(results[1].data.problemSet.exam).toBe("III");
    }
  });

  it("rejects STEP manifests that omit the exam variant (I/II/III are required)", async () => {
    await writeFile(
      path.resolve(scratchDir, "step-missing-exam.json"),
      JSON.stringify({
        problemSet: { contest: "STEP", year: 2020 },
        problems: [
          {
            number: 1,
            statement: "STEP placeholder Q1 — prove that $1 + 1 = 2$.",
            answerFormat: "WORKED_SOLUTION",
            solutionSketch: "By definition of $2$ as the successor of $1$."
          }
        ]
      }),
      "utf8"
    );

    const results = await loadAllStepManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => /exam/i.test(message))).toBe(true);
    }
  });

  it("reports manifests whose contest is not STEP as invalid (guard-rail)", async () => {
    await writeFile(
      path.resolve(scratchDir, "misfiled-mat.json"),
      JSON.stringify({
        problemSet: { contest: "MAT", year: 2020 },
        problems: [
          {
            number: 1,
            statement: "MAT placeholder Q1 — evaluate $2 + 2$.",
            answer: "B",
            answerFormat: "MULTIPLE_CHOICE",
            choices: ["$3$", "$4$", "$5$", "$6$", "$7$"]
          }
        ]
      }),
      "utf8"
    );

    const results = await loadAllStepManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => message.includes("STEP"))).toBe(true);
    }
  });

  it("surfaces schema errors rather than throwing (missing solutionSketch on WORKED_SOLUTION)", async () => {
    await writeFile(
      path.resolve(scratchDir, "step-broken.json"),
      JSON.stringify({
        problemSet: { contest: "STEP", year: 2021, exam: "III" },
        problems: [
          {
            number: 1,
            statement: "STEP III 2021 placeholder — prove by induction that $n < 2^n$ for all positive $n$.",
            answerFormat: "WORKED_SOLUTION"
          }
        ]
      }),
      "utf8"
    );

    const results = await loadAllStepManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => message.includes("solutionSketch"))).toBe(true);
    }
  });
});
