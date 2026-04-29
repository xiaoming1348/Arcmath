import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAT_MANIFEST_DIR, loadAllMatManifests, loadMatManifest } from "./load-manifest";

describe("loadMatManifest", () => {
  it("loads the bundled 2020 MAT manifest and validates it against the import schema", async () => {
    const result = await loadMatManifest(path.resolve(MAT_MANIFEST_DIR, "mat-2020.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.problemSet.contest).toBe("MAT");
    expect(result.data.problemSet.year).toBe(2020);
    // MAT is relaxed on expectedProblemCount (null), so the bundled
    // 2020 MVP just needs to be non-empty and contiguously numbered.
    expect(result.data.problems.length).toBeGreaterThanOrEqual(1);
    // The MVP deliberately mixes MULTIPLE_CHOICE (Q1-style subparts)
    // with at least one WORKED_SOLUTION (Q2-style long question) so
    // both UI render paths are exercised.
    const formats = new Set(result.data.problems.map((problem) => problem.answerFormat));
    expect(formats.has("MULTIPLE_CHOICE")).toBe(true);
    expect(formats.has("WORKED_SOLUTION")).toBe(true);
  });

  it("normalizes exam to null on the 2020 manifest (no exam variant for MAT)", async () => {
    const result = await loadMatManifest(path.resolve(MAT_MANIFEST_DIR, "mat-2020.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.problemSet.exam).toBeNull();
  });
});

describe("loadAllMatManifests", () => {
  let scratchDir: string;

  beforeEach(async () => {
    scratchDir = await mkdtemp(path.resolve(tmpdir(), "ingest-oxford-mat-"));
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it("returns one entry per .json file in the directory, ordered by filename", async () => {
    // Two minimal manifests. MAT has expectedProblemCount=null so we
    // can use very small papers — a single MULTIPLE_CHOICE problem is
    // enough to exercise the loader, even though real MAT papers are
    // 16 problems (10 MC subparts + 6 long questions).
    const makeMiniPaper = (year: number) => ({
      problemSet: { contest: "MAT" as const, year },
      problems: [
        {
          number: 1,
          statement: `MAT ${year} placeholder Q1A — evaluate $1 + 1$.`,
          answer: "B",
          answerFormat: "MULTIPLE_CHOICE" as const,
          choices: ["$0$", "$2$", "$3$", "$4$", "$5$"]
        }
      ]
    });
    await writeFile(
      path.resolve(scratchDir, "mat-2019.json"),
      JSON.stringify(makeMiniPaper(2019)),
      "utf8"
    );
    await writeFile(
      path.resolve(scratchDir, "mat-2020.json"),
      JSON.stringify(makeMiniPaper(2020)),
      "utf8"
    );

    const results = await loadAllMatManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(true);
    if (results[0].ok && results[1].ok) {
      expect(results[0].data.problemSet.year).toBe(2019);
      expect(results[1].data.problemSet.year).toBe(2020);
    }
  });

  it("reports manifests whose contest is not MAT as invalid (guard-rail)", async () => {
    await writeFile(
      path.resolve(scratchDir, "misfiled-euclid.json"),
      JSON.stringify({
        problemSet: { contest: "EUCLID", year: 2024 },
        problems: Array.from({ length: 10 }, (_, index) => ({
          number: index + 1,
          statement: `Euclid placeholder ${index + 1}`,
          answer: "1",
          answerFormat: "INTEGER"
        }))
      }),
      "utf8"
    );

    const results = await loadAllMatManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => message.includes("MAT"))).toBe(true);
    }
  });

  it("surfaces schema errors rather than throwing", async () => {
    // WORKED_SOLUTION requires solutionSketch; leaving it off must
    // surface as a validation error, not a thrown exception.
    await writeFile(
      path.resolve(scratchDir, "mat-broken.json"),
      JSON.stringify({
        problemSet: { contest: "MAT", year: 2021 },
        problems: [
          {
            number: 1,
            statement: "MAT 2021 Q2 — prove that the sum of two odd integers is even.",
            answerFormat: "WORKED_SOLUTION"
          }
        ]
      }),
      "utf8"
    );

    const results = await loadAllMatManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => message.includes("solutionSketch"))).toBe(true);
    }
  });

  it("rejects MAT manifests that include an exam variant (MAT has no exam variants)", async () => {
    await writeFile(
      path.resolve(scratchDir, "mat-with-exam.json"),
      JSON.stringify({
        problemSet: { contest: "MAT", year: 2020, exam: "A" },
        problems: [
          {
            number: 1,
            statement: "MAT 2020 Q1A — evaluate $2 \\cdot 3$.",
            answer: "B",
            answerFormat: "MULTIPLE_CHOICE",
            choices: ["$5$", "$6$", "$7$", "$8$", "$9$"]
          }
        ]
      }),
      "utf8"
    );

    const results = await loadAllMatManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => /exam/i.test(message))).toBe(true);
    }
  });
});
