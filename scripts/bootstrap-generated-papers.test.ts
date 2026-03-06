import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  parseBootstrapArgs,
  planBootstrapSteps,
  resolveSummaryPath,
  runBootstrap,
  type BootstrapArgs
} from "./bootstrap-generated-papers";

async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "bootstrap-generated-"));
}

describe("bootstrap-generated-papers parse/validation", () => {
  it("parses contests from repeated and csv flags", () => {
    const parsed = parseBootstrapArgs([
      "--output-dir",
      "ingest/out",
      "--contest",
      "amc12,aime",
      "--contest",
      "AMC10"
    ]);

    expect(parsed.contests).toEqual(["AMC12", "AIME", "AMC10"]);
  });

  it("rejects invalid combinations", () => {
    expect(() =>
      parseBootstrapArgs(["--output-dir", "ingest/out", "--retry-failed-only", "--skip-generate"])
    ).toThrow("--retry-failed-only cannot be used with --skip-generate");

    expect(() =>
      parseBootstrapArgs(["--output-dir", "ingest/out", "--year-from", "2025", "--year-to", "2005"])
    ).toThrow("--year-from cannot be greater than --year-to");
  });
});

describe("bootstrap-generated-papers planning", () => {
  it("keeps steps planned on dry-run and passes scoped import args", () => {
    const parsed = parseBootstrapArgs(["--output-dir", "ingest/out", "--dry-run", "--contest", "AMC12"]);
    const plan = planBootstrapSteps(parsed);

    expect(plan[0]?.name).toBe("fetch");
    expect(plan[0]?.skipped).toBe(false);
    expect(plan[1]?.name).toBe("import");
    expect(plan[1]?.skipped).toBe(false);
    expect(plan[1]?.args).toContain("--contest");
    expect(plan[2]?.name).toBe("generate");
    expect(plan[2]?.skipped).toBe(false);
    expect(plan[2]?.args).toContain("--contest");
  });

  it("passes contest/year scope to import step", () => {
    const parsed = parseBootstrapArgs([
      "--output-dir",
      "ingest/out",
      "--contest",
      "AMC12",
      "--year-from",
      "2010",
      "--year-to",
      "2025",
      "--limit",
      "15"
    ]);
    const plan = planBootstrapSteps(parsed);

    expect(plan[1]?.args).toEqual([
      "aops:import",
      "--dir",
      parsed.outputDir,
      "--contest",
      "AMC12",
      "--year-from",
      "2010",
      "--year-to",
      "2025",
      "--limit-files",
      "15"
    ]);
    expect(plan[2]?.name).toBe("generate");
  });

  it("respects explicit skip flags", () => {
    const parsed = parseBootstrapArgs([
      "--output-dir",
      "ingest/out",
      "--skip-fetch",
      "--skip-import",
      "--skip-generate"
    ]);
    const plan = planBootstrapSteps(parsed);
    expect(plan.every((step) => step.skipped)).toBe(true);
  });
});

describe("bootstrap-generated-papers summary", () => {
  it("writes summary JSON with step statuses", async () => {
    const tempDir = await makeTempDir();
    const args: BootstrapArgs = {
      outputDir: tempDir,
      dryRun: false,
      skipFetch: false,
      skipImport: false,
      skipGenerate: false,
      retryFailedOnly: false,
      continueOnError: true
    };

    const exitCodes = [0, 1, 0];
    const summary = await runBootstrap(args, {
      execute: async () => exitCodes.shift() ?? 0
    });

    expect(summary.overallStatus).toBe("failed");
    expect(summary.steps.fetch.status).toBe("success");
    expect(summary.steps.import.status).toBe("failed");
    expect(summary.steps.generate.status).toBe("success");
    expect(summary.steps.fetch.executed).toBe(true);
    expect(summary.steps.import.executed).toBe(true);
    expect(summary.steps.import.skipReason).toBeNull();

    const summaryPath = resolveSummaryPath(args);
    const raw = await readFile(summaryPath, "utf8");
    const parsed = JSON.parse(raw) as typeof summary;
    expect(parsed.effectiveArgs.outputDir).toBe(tempDir);
    expect(parsed.steps.import.exitCode).toBe(1);
  });

  it("stops after failure when continue-on-error is off", async () => {
    const tempDir = await makeTempDir();
    const args: BootstrapArgs = {
      outputDir: tempDir,
      dryRun: false,
      skipFetch: false,
      skipImport: false,
      skipGenerate: false,
      retryFailedOnly: false,
      continueOnError: false
    };

    const calls: string[] = [];
    const summary = await runBootstrap(args, {
      execute: async (_command, commandArgs) => {
        calls.push(commandArgs[0] ?? "");
        if (commandArgs[0] === "aops:import") {
          return 2;
        }
        return 0;
      }
    });

    expect(summary.overallStatus).toBe("failed");
    expect(calls).toEqual(["aops:fetch", "aops:import"]);
    expect(summary.steps.generate.status).toBe("skipped");
    expect(summary.steps.generate.skipReason).toBe("blocked by previous step failure");
    expect(summary.steps.generate.executed).toBe(false);
  });

  it("does not execute any child command in dry-run mode", async () => {
    const tempDir = await makeTempDir();
    const args: BootstrapArgs = {
      outputDir: tempDir,
      dryRun: true,
      skipFetch: false,
      skipImport: false,
      skipGenerate: false,
      retryFailedOnly: false,
      continueOnError: false
    };

    const execute = vi.fn(async () => 0);
    const summary = await runBootstrap(args, { execute });

    expect(execute).not.toHaveBeenCalled();
    expect(summary.overallStatus).toBe("success");
    expect(summary.steps.fetch.status).toBe("skipped");
    expect(summary.steps.fetch.skipReason).toBe("dry-run plan only");
    expect(summary.steps.fetch.executed).toBe(false);
    expect(summary.steps.import.skipReason).toBe("dry-run plan only");
    expect(summary.steps.generate.skipReason).toBe("dry-run plan only");
  });
});
