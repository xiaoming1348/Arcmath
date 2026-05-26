import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { USAJMO_MANIFEST_DIR, loadAllUsajmoManifests, loadUsajmoManifest } from "./load-manifest";

describe("loadUsajmoManifest", () => {
  it("loads the bundled USAJMO 2024 manifest and validates it against the import schema", async () => {
    const result = await loadUsajmoManifest(path.resolve(USAJMO_MANIFEST_DIR, "usajmo-2024.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.problemSet.contest).toBe("USAJMO");
    expect(result.data.problemSet.year).toBe(2024);
    // USAJMO is 6 problems — the shared schema enforces this via
    // expectedProblemCount. Reasserting here catches regressions that
    // accidentally rewrite the rule to "relaxed".
    expect(result.data.problems).toHaveLength(6);
    // Every USAJMO problem is proof-based — WORKED_SOLUTION only.
    for (const problem of result.data.problems) {
      expect(problem.answerFormat).toBe("WORKED_SOLUTION");
      expect(problem.solutionSketch).toBeDefined();
    }
  });

  it("normalizes exam to null on the 2024 manifest (USAJMO has no exam variant)", async () => {
    const result = await loadUsajmoManifest(path.resolve(USAJMO_MANIFEST_DIR, "usajmo-2024.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.problemSet.exam).toBeNull();
  });

  it("loads all 6 bundled USAJMO manifests (2019–2024) without errors", async () => {
    // Sanity check: every year's manifest should parse cleanly. If
    // anyone ships a manifest with a malformed LaTeX block or wrong
    // problem count, this test fails before the import job hits prod.
    const years = [2019, 2020, 2021, 2022, 2023, 2024];
    for (const year of years) {
      const result = await loadUsajmoManifest(path.resolve(USAJMO_MANIFEST_DIR, `usajmo-${year}.json`));
      expect(result.ok, `USAJMO ${year} manifest failed validation`).toBe(true);
      if (!result.ok) continue;
      expect(result.data.problemSet.year).toBe(year);
      expect(result.data.problemSet.contest).toBe("USAJMO");
      expect(result.data.problems).toHaveLength(6);
    }
  });
});

describe("loadAllUsajmoManifests", () => {
  let scratchDir: string;

  beforeEach(async () => {
    scratchDir = await mkdtemp(path.resolve(tmpdir(), "ingest-usajmo-"));
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it("returns one entry per .json file, ordered by filename", async () => {
    // USAJMO requires exactly 6 problems; produce minimal placeholder
    // papers with 6 trivially-correct WORKED_SOLUTION problems just
    // to exercise the loader. Real manifests live in ./manifests/.
    const makePaper = (year: number) => ({
      problemSet: { contest: "USAJMO" as const, year },
      problems: Array.from({ length: 6 }, (_, index) => ({
        number: index + 1,
        statement: `USAJMO ${year} placeholder Problem ${index + 1}: prove that any integer $n$ satisfies $n = n$.`,
        answerFormat: "WORKED_SOLUTION" as const,
        solutionSketch: "By the reflexive property of equality, $n = n$ for every integer $n$."
      }))
    });
    await writeFile(
      path.resolve(scratchDir, "usajmo-2019.json"),
      JSON.stringify(makePaper(2019)),
      "utf8"
    );
    await writeFile(
      path.resolve(scratchDir, "usajmo-2020.json"),
      JSON.stringify(makePaper(2020)),
      "utf8"
    );

    const results = await loadAllUsajmoManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(true);
    if (results[0].ok && results[1].ok) {
      expect(results[0].data.problemSet.year).toBe(2019);
      expect(results[1].data.problemSet.year).toBe(2020);
    }
  });

  it("rejects USAJMO manifests with the wrong problem count (must be exactly 6)", async () => {
    await writeFile(
      path.resolve(scratchDir, "usajmo-short.json"),
      JSON.stringify({
        problemSet: { contest: "USAJMO", year: 2020 },
        problems: Array.from({ length: 4 }, (_, index) => ({
          number: index + 1,
          statement: `USAJMO 2020 short placeholder Problem ${index + 1} — prove $1 \\leq 1$.`,
          answerFormat: "WORKED_SOLUTION",
          solutionSketch: "Trivial."
        }))
      }),
      "utf8"
    );

    const results = await loadAllUsajmoManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => message.includes("6 problems"))).toBe(true);
    }
  });

  it("rejects USAJMO manifests that include an exam variant (USAJMO has none)", async () => {
    await writeFile(
      path.resolve(scratchDir, "usajmo-bad-exam.json"),
      JSON.stringify({
        problemSet: { contest: "USAJMO", year: 2020, exam: "I" },
        problems: Array.from({ length: 6 }, (_, index) => ({
          number: index + 1,
          statement: `USAJMO 2020 placeholder Problem ${index + 1} — prove $1 \\leq 1$.`,
          answerFormat: "WORKED_SOLUTION",
          solutionSketch: "Trivial."
        }))
      }),
      "utf8"
    );

    const results = await loadAllUsajmoManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => /exam/i.test(message))).toBe(true);
    }
  });

  it("reports manifests whose contest is not USAJMO as invalid (guard-rail)", async () => {
    await writeFile(
      path.resolve(scratchDir, "misfiled-usamo.json"),
      JSON.stringify({
        problemSet: { contest: "USAMO", year: 2020 },
        problems: Array.from({ length: 6 }, (_, index) => ({
          number: index + 1,
          statement: `USAMO 2020 placeholder Problem ${index + 1} — prove $1 \\leq 1$.`,
          answerFormat: "WORKED_SOLUTION",
          solutionSketch: "Trivial."
        }))
      }),
      "utf8"
    );

    const results = await loadAllUsajmoManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => message.includes("USAJMO"))).toBe(true);
    }
  });
});
