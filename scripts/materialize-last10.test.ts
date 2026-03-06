import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMaterializeFetchOptions,
  buildMaterializeImportOptions,
  cleanupLegacyRootArtifacts,
  parseMaterializeArgs,
  resolveMaterializePaths,
  type MaterializeArgs
} from "./materialize-last10";

describe("materialize-last10 args + pathing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves output paths under invocation cwd", () => {
    vi.stubEnv("INIT_CWD", "/repo/root");
    const args = parseMaterializeArgs(["--output-dir", "tmp/last10-materialize"]);
    const paths = resolveMaterializePaths(args);

    expect(args.outputDir).toBe(path.join("/repo/root", "tmp/last10-materialize"));
    expect(paths.importsDir).toBe(path.join("/repo/root", "tmp/last10-materialize", "imports"));
    expect(paths.validationDir).toBe(path.join("/repo/root", "tmp/last10-materialize", "validation"));
    expect(paths.summaryPath).toBe(path.join("/repo/root", "tmp/last10-materialize", "materialize-last10-summary.json"));
  });
});

describe("materialize-last10 orchestration options", () => {
  const baseArgs: MaterializeArgs = {
    outputDir: "/repo/root/tmp/last10-materialize",
    source: "wiki",
    contests: ["AMC8", "AMC10", "AMC12", "AIME"]
  };

  it("builds fetch options with strict year/contest scope and imports directory", () => {
    const paths = resolveMaterializePaths(baseArgs);
    const fetchOptions = buildMaterializeFetchOptions({
      args: baseArgs,
      yearFrom: 2016,
      yearTo: 2025,
      paths
    });

    expect(fetchOptions.yearFrom).toBe(2016);
    expect(fetchOptions.yearTo).toBe(2025);
    expect(fetchOptions.includeContests).toEqual(["AMC8", "AMC10", "AMC12", "AIME"]);
    expect(fetchOptions.outputDir).toBe("/repo/root/tmp/last10-materialize/imports");
    expect(fetchOptions.skipExisting).toBe(true);
  });

  it("builds import options scoped to the same window and imports directory", () => {
    const args: MaterializeArgs = {
      ...baseArgs,
      limit: 50
    };
    const paths = resolveMaterializePaths(args);
    const importOptions = buildMaterializeImportOptions({
      args,
      yearFrom: 2016,
      yearTo: 2025,
      paths
    });

    expect(importOptions.dir).toBe("/repo/root/tmp/last10-materialize/imports");
    expect(importOptions.yearFrom).toBe(2016);
    expect(importOptions.yearTo).toBe(2025);
    expect(importOptions.contests).toEqual(["AMC8", "AMC10", "AMC12", "AIME"]);
    expect(importOptions.limitFiles).toBe(50);
  });

  it("cleans legacy root-level contest json artifacts", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "materialize-last10-clean-"));
    await writeFile(path.join(tempDir, "AMC12_2015_A.json"), "{}\n", "utf8");
    await writeFile(path.join(tempDir, "AIME_2020_I.json"), "{}\n", "utf8");
    await writeFile(path.join(tempDir, "materialize-last10-summary.json"), "{}\n", "utf8");

    const removed = await cleanupLegacyRootArtifacts(tempDir);
    const remaining = await readdir(tempDir);

    expect(removed).toBe(2);
    expect(remaining).toEqual(["materialize-last10-summary.json"]);
  });
});
