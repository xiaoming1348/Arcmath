import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EUCLID_MANIFEST_DIR, loadAllEuclidManifests, loadEuclidManifest } from "./load-manifest";

describe("loadEuclidManifest", () => {
  it("loads the bundled 2024 Euclid manifest and validates it against the import schema", async () => {
    const result = await loadEuclidManifest(path.resolve(EUCLID_MANIFEST_DIR, "euclid-2024.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.problemSet.contest).toBe("EUCLID");
    expect(result.data.problemSet.year).toBe(2024);
    // The Euclid structure is fixed at 10 problems; the schema enforces
    // this, so this is really asserting that we shipped a complete
    // paper.
    expect(result.data.problems).toHaveLength(10);
    // Confirm the WORKED_SOLUTION path is exercised — the 2024 MVP
    // covers problems 5, 9, 10 as proof-style.
    const workedSolutionCount = result.data.problems.filter(
      (problem) => problem.answerFormat === "WORKED_SOLUTION"
    ).length;
    expect(workedSolutionCount).toBeGreaterThan(0);
  });

  it("normalizes exam to null on the 2024 manifest (no exam variant for Euclid)", async () => {
    const result = await loadEuclidManifest(path.resolve(EUCLID_MANIFEST_DIR, "euclid-2024.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.problemSet.exam).toBeNull();
  });
});

describe("loadAllEuclidManifests", () => {
  let scratchDir: string;

  beforeEach(async () => {
    scratchDir = await mkdtemp(path.resolve(tmpdir(), "ingest-cemc-"));
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it("returns one entry per .json file in the directory, ordered by filename", async () => {
    // Two minimal manifests — the schema rejects anything that isn't
    // a complete Euclid paper, so we spin up the full 10-problem shape
    // with placeholder content.
    const makePaper = (year: number) => ({
      problemSet: { contest: "EUCLID" as const, year, sourceUrl: "https://example.com" },
      problems: Array.from({ length: 10 }, (_, index) => ({
        number: index + 1,
        statement: `Euclid ${year} placeholder problem ${index + 1}`,
        answer: String(index + 1),
        answerFormat: "INTEGER" as const
      }))
    });
    await writeFile(
      path.resolve(scratchDir, "euclid-2023.json"),
      JSON.stringify(makePaper(2023)),
      "utf8"
    );
    await writeFile(
      path.resolve(scratchDir, "euclid-2024.json"),
      JSON.stringify(makePaper(2024)),
      "utf8"
    );

    const results = await loadAllEuclidManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(true);
    if (results[0].ok && results[1].ok) {
      expect(results[0].data.problemSet.year).toBe(2023);
      expect(results[1].data.problemSet.year).toBe(2024);
    }
  });

  it("reports manifests whose contest is not EUCLID as invalid (guard-rail)", async () => {
    await writeFile(
      path.resolve(scratchDir, "misfiled-amc.json"),
      JSON.stringify({
        problemSet: { contest: "AMC10", year: 2024, exam: "A" },
        problems: Array.from({ length: 25 }, (_, index) => ({
          number: index + 1,
          statement: `AMC placeholder ${index + 1}`,
          answer: "A",
          answerFormat: "MULTIPLE_CHOICE",
          choices: ["1", "2", "3", "4", "5"]
        }))
      }),
      "utf8"
    );

    const results = await loadAllEuclidManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].errors.some((message) => message.includes("EUCLID"))).toBe(true);
    }
  });

  it("surfaces schema errors rather than throwing", async () => {
    await writeFile(
      path.resolve(scratchDir, "euclid-broken.json"),
      JSON.stringify({
        problemSet: { contest: "EUCLID", year: 2024 },
        problems: [
          {
            number: 1,
            statement: "Broken: missing answer for INTEGER format.",
            answerFormat: "INTEGER"
          }
        ]
      }),
      "utf8"
    );

    const results = await loadAllEuclidManifests({ manifestDir: scratchDir });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
  });
});
