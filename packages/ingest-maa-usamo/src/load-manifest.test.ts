import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { USAMO_MANIFEST_DIR, loadAllUsamoManifests, loadUsamoManifest } from "./load-manifest";

describe("loadUsamoManifest", () => {
  it("loads the bundled USAMO 2020 manifest and validates it against the import schema", async () => {
    const result = await loadUsamoManifest(path.resolve(USAMO_MANIFEST_DIR, "usamo-2020.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.problemSet.contest).toBe("USAMO");
    expect(result.data.problemSet.year).toBe(2020);
    // USAMO is 6 problems — the shared schema enforces this via
    // expectedProblemCount. Reasserting here catches regressions that
    // accidentally rewrite the rule to "relaxed".
    expect(result.data.problems).toHaveLength(6);
    // Every USAMO problem is proof-based — WORKED_SOLUTION only.
    for (const problem of result.data.problems) {
      expect(problem.answerFormat).toBe("WORKED_SOLUTION");
      expect(problem.solutionSketch).toBeDefined();
    }
  });

  it("normalizes exam to null on the 2020 manifest (USAMO has no exam variant)", async () => {
    const result = await loadUsamoManifest(path.resolve(USAMO_MANIFEST_DIR, "usamo-2020.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.problemSet.exam).toBeNull();
  });
});

describe("loadAllUsamoManifests", () => {
  let scratchDir: string;

  beforeEach(async () => {
    scratchDir = await mkdtemp(path.resolve(tmpdir(), "ingest-usamo-"));
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it("returns one entry per .json file, ordered by filename", async () => {
    // USAMO requires exactly 6 problems; produce minimal placeholder
    // papers with 6 trivially-correct WORKED_SOLUTION problems just
    // to exercise the loader. Real manifests live in ./manifests/.
    const makePaper = (year: number) => ({
      problemSet: { contest: "USAMO" as const, year },
      problems: Array.from({ length: 6 }, (_, index) => ({
        number: index + 1,
        statement: `USAMO ${year} placeholder Problem ${index + 1}: prove that any integer $n$ satisfies $n = n$.`,
        answerFormat: "WORKED_SOLUTION" as const,
        solutionSketch: "By the reflexive property of equality, $n = n$ for every integer $n$."
      }))
    });
    await writeFile(
      path.resolve(scratchDir, "usamo-2019.json"),
      JSON.stringify(makePaper(2019)),
      "utf8"
    );
    await writeFile(
      path.resolve(scratchDir, "usamo-2020.json"),
      JSON.stringify(makePaper(2020)),
      "utf8"
    );

    const results = await loadAllUsamoManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(true);
    if (results[0].ok && results[1].ok) {
      expect(results[0].data.problemSet.year).toBe(2019);
      expect(results[1].data.problemSet.year).toBe(2020);
    }
  });

  it("rejects USAMO manifests with the wrong problem count (must be exactly 6)", async () => {
    await writeFile(
      path.resolve(scratchDir, "usamo-short.json"),
      JSON.stringify({
        problemSet: { contest: "USAMO", year: 2020 },
        problems: Array.from({ length: 4 }, (_, index) => ({
          number: index + 1,
          statement: `USAMO 2020 short placeholder Problem ${index + 1} — prove $1 \\leq 1$.`,
          answerFormat: "WORKED_SOLUTION",
          solutionSketch: "Trivial."
        }))
      }),
      "utf8"
    );

    const results = await loadAllUsamoManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => message.includes("6 problems"))).toBe(true);
    }
  });

  it("rejects USAMO manifests that include an exam variant (USAMO has none)", async () => {
    await writeFile(
      path.resolve(scratchDir, "usamo-bad-exam.json"),
      JSON.stringify({
        problemSet: { contest: "USAMO", year: 2020, exam: "I" },
        problems: Array.from({ length: 6 }, (_, index) => ({
          number: index + 1,
          statement: `USAMO 2020 placeholder Problem ${index + 1} — prove $1 \\leq 1$.`,
          answerFormat: "WORKED_SOLUTION",
          solutionSketch: "Trivial."
        }))
      }),
      "utf8"
    );

    const results = await loadAllUsamoManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => /exam/i.test(message))).toBe(true);
    }
  });

  it("reports manifests whose contest is not USAMO as invalid (guard-rail)", async () => {
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

    const results = await loadAllUsamoManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => message.includes("USAMO"))).toBe(true);
    }
  });
});
