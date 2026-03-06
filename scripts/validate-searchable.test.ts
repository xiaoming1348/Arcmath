import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseValidateSearchableArgs } from "./validate-searchable";

describe("validate-searchable root wrapper args", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves output and report paths from invocation cwd", () => {
    vi.stubEnv("INIT_CWD", "/repo/root");

    const parsed = parseValidateSearchableArgs([
      "--out-dir",
      "tmp/last10-materialize/validation",
      "--report",
      "tmp/last10-materialize/validation/custom-report.json"
    ]);

    expect(parsed.outDir).toBe(path.join("/repo/root", "tmp/last10-materialize/validation"));
    expect(parsed.reportPath).toBe(path.join("/repo/root", "tmp/last10-materialize/validation/custom-report.json"));
  });
});
