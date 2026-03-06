import { describe, expect, it, vi } from "vitest";
import { parseImportArgs, runImportCli } from "./import-cli";

function makePayload(input: { contest: "AMC8" | "AMC10" | "AMC12" | "AIME"; year: number; exam: string | null }) {
  return JSON.stringify({
    problemSet: {
      contest: input.contest,
      year: input.year,
      exam: input.exam,
      sourceUrl: "https://example.com/source"
    },
    problems: [
      {
        number: 1,
        statement: "Sample statement",
        answer: "A"
      }
    ]
  });
}

describe("aops import cli args", () => {
  it("parses scoped flags including repeated and csv contests", () => {
    const parsed = parseImportArgs([
      "--dir",
      "tmp/aops",
      "--contest",
      "amc12,aime",
      "--contest",
      "AMC10",
      "--year-from",
      "2010",
      "--year-to",
      "2025",
      "--limit-files",
      "30",
      "--dry-run"
    ]);

    expect(parsed.contests).toEqual(["AMC12", "AIME", "AMC10"]);
    expect(parsed.yearFrom).toBe(2010);
    expect(parsed.yearTo).toBe(2025);
    expect(parsed.limitFiles).toBe(30);
    expect(parsed.dryRun).toBe(true);
  });

  it("validates invalid year range", () => {
    expect(() => parseImportArgs(["--year-from", "2025", "--year-to", "2010"])).toThrow(
      "--year-from cannot be greater than --year-to"
    );
  });
});

describe("aops import cli run", () => {
  it("supports dry-run without DB writes", async () => {
    const connect = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => undefined);
    const importPayload = vi.fn(async () => undefined);

    const summary = await runImportCli(
      {
        dir: "/virtual",
        contests: ["AMC12"],
        yearFrom: 2010,
        yearTo: 2025,
        dryRun: true
      },
      {
        listDir: async () => ["a.json", "b.json"],
        readText: async (filePath) =>
          filePath.endsWith("a.json")
            ? makePayload({ contest: "AMC12", year: 2020, exam: "A" })
            : makePayload({ contest: "AMC10", year: 2020, exam: "A" }),
        connect,
        disconnect,
        importPayload
      }
    );

    expect(summary.files).toBe(2);
    expect(summary.filesMatched).toBe(1);
    expect(summary.filesSkippedByFilter).toBe(1);
    expect(summary.dryRun).toBe(true);
    expect(summary.setsCreated).toBe(0);
    expect(importPayload).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("reports matched/skipped counters with limit", async () => {
    const importPayload = vi.fn(async () => undefined);

    const summary = await runImportCli(
      {
        dir: "/virtual",
        contests: ["AMC12"],
        dryRun: false,
        limitFiles: 1
      },
      {
        listDir: async () => ["a.json", "b.json", "c.json"],
        readText: async (filePath) => {
          if (filePath.endsWith("a.json")) {
            return makePayload({ contest: "AMC12", year: 2022, exam: "A" });
          }
          if (filePath.endsWith("b.json")) {
            return makePayload({ contest: "AMC12", year: 2023, exam: "B" });
          }
          return makePayload({ contest: "AIME", year: 2023, exam: "I" });
        },
        connect: async () => undefined,
        disconnect: async () => undefined,
        importPayload: async (payload, stats) => {
          importPayload(payload);
          stats.setsCreated += 1;
          stats.problemsCreated += payload.problems.length;
        }
      }
    );

    expect(summary.files).toBe(3);
    expect(summary.filesMatched).toBe(2);
    expect(summary.filesSkippedByFilter).toBe(1);
    expect(summary.filesSkippedByLimit).toBe(1);
    expect(summary.setsCreated).toBe(1);
    expect(summary.problemsCreated).toBe(1);
    expect(importPayload).toHaveBeenCalledTimes(1);
  });

  it("skips non-import json files without failing", async () => {
    const summary = await runImportCli(
      {
        dir: "/virtual",
        dryRun: true
      },
      {
        listDir: async () => ["bootstrap-generated-summary.json"],
        readText: async () =>
          JSON.stringify({
            startedAt: "2026-01-01T00:00:00.000Z",
            overallStatus: "success"
          }),
        connect: async () => undefined,
        disconnect: async () => undefined,
        importPayload: async () => undefined
      }
    );

    expect(summary.files).toBe(1);
    expect(summary.filesMatched).toBe(0);
    expect(summary.filesSkippedByFilter).toBe(1);
    expect(summary.failedFiles).toBe(0);
  });
});
