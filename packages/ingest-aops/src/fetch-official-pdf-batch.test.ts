import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOfficialPdfBatch,
  getOfficialPdfArtifactPaths,
  type OfficialPdfBatchCliFlags,
  type OfficialPdfBatchManifestEntry
} from "./cli";

async function writeManifest(root: string, entries: OfficialPdfBatchManifestEntry[]): Promise<string> {
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  return manifestPath;
}

describe("fetch-official-pdf-batch command", () => {
  const createdDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const dir of createdDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("processes multiple manifest entries and writes summary", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ingest-batch-"));
    const outDir = path.join(root, "out");
    const cacheDir = path.join(root, "cache");
    const summaryOut = path.join(outDir, "summary.json");
    createdDirs.push(root);

    const manifestPath = await writeManifest(root, [
      { contest: "AMC12", year: 2025, exam: "A", label: "A paper" },
      { contest: "AMC12", year: 2025, exam: "B", label: "B paper" }
    ]);

    const pdfA = "https://artofproblemsolving.com/community/contest/download/c100_amc_12/2025";
    const pdfB = "https://artofproblemsolving.com/community/contest/download/c101_amc_12/2025";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("title=2025_AMC_12A")) {
        return new Response(`<a href=\"${pdfA}\">PDF</a>`, { status: 200 });
      }
      if (url.includes("title=2025_AMC_12B")) {
        return new Response(`<a href=\"${pdfB}\">PDF</a>`, { status: 200 });
      }
      if (url === pdfA || url === pdfB) {
        return new Response(Buffer.from("%PDF-1.7\nbatch"), {
          status: 200,
          headers: { "content-type": "application/pdf" }
        });
      }
      return new Response("not found", { status: 404 });
    });

    const flags: OfficialPdfBatchCliFlags = {
      manifestPath,
      outDir,
      summaryOut,
      concurrency: 2,
      strictMatch: false,
      continueOnError: false,
      skipExisting: false,
      cacheDir,
      cacheOnly: false,
      refresh: true,
      delayMs: 0
    };

    const summary = await fetchOfficialPdfBatch(flags);

    expect(summary.totals.requested).toBe(2);
    expect(summary.totals.processed).toBe(2);
    expect(summary.totals.succeeded).toBe(2);
    expect(summary.totals.failed).toBe(0);
    expect(summary.totals.skippedExisting).toBe(0);
    expect(summary.items).toHaveLength(2);
    expect(summary.items.every((item) => item.status === "succeeded")).toBe(true);

    const persisted = JSON.parse(await readFile(summaryOut, "utf8")) as { totals: { succeeded: number } };
    expect(persisted.totals.succeeded).toBe(2);
  });

  it("skips entries when artifacts already exist and --skip-existing is enabled", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ingest-batch-"));
    const outDir = path.join(root, "out");
    const cacheDir = path.join(root, "cache");
    const summaryOut = path.join(outDir, "summary.json");
    createdDirs.push(root);

    const entry: OfficialPdfBatchManifestEntry = { contest: "AMC12", year: 2025, exam: "A" };
    const manifestPath = await writeManifest(root, [entry]);
    const artifacts = getOfficialPdfArtifactPaths({
      outDir,
      contest: entry.contest,
      year: entry.year,
      exam: entry.exam
    });

    await rm(outDir, { recursive: true, force: true });
    await mkdir(path.dirname(artifacts.pdfPath), { recursive: true });
    await writeFile(artifacts.pdfPath, Buffer.from("%PDF-1.7\nexisting"));
    await writeFile(artifacts.metaPath, "{}\n", "utf8");

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const summary = await fetchOfficialPdfBatch({
      manifestPath,
      outDir,
      summaryOut,
      concurrency: 2,
      strictMatch: false,
      continueOnError: false,
      skipExisting: true,
      cacheDir,
      cacheOnly: false,
      refresh: true,
      delayMs: 0
    });

    expect(summary.totals.requested).toBe(1);
    expect(summary.totals.processed).toBe(1);
    expect(summary.totals.skippedExisting).toBe(1);
    expect(summary.items[0]?.status).toBe("skippedExisting");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("records strict-match failures and continues when --continue-on-error is enabled", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ingest-batch-"));
    const outDir = path.join(root, "out");
    const cacheDir = path.join(root, "cache");
    const summaryOut = path.join(outDir, "summary.json");
    createdDirs.push(root);

    const manifestPath = await writeManifest(root, [
      { contest: "AMC12", year: 2025, exam: "B", label: "wrong" },
      { contest: "AMC12", year: 2025, exam: "A", label: "right" }
    ]);

    const wrongPdf = "https://artofproblemsolving.com/community/contest/download/c111_amc_10/2023";
    const rightPdf = "https://artofproblemsolving.com/community/contest/download/c100_amc_12/2025";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("title=2025_AMC_12B")) {
        return new Response(`<a href=\"${wrongPdf}\">PDF</a>`, { status: 200 });
      }
      if (url.includes("title=2025_AMC_12A")) {
        return new Response(`<a href=\"${rightPdf}\">PDF</a>`, { status: 200 });
      }
      if (url === rightPdf) {
        return new Response(Buffer.from("%PDF-1.7\nright"), {
          status: 200,
          headers: { "content-type": "application/pdf" }
        });
      }
      return new Response("not found", { status: 404 });
    });

    const summary = await fetchOfficialPdfBatch({
      manifestPath,
      outDir,
      summaryOut,
      concurrency: 1,
      strictMatch: true,
      continueOnError: true,
      skipExisting: false,
      cacheDir,
      cacheOnly: false,
      refresh: true,
      delayMs: 0
    });

    expect(summary.totals.requested).toBe(2);
    expect(summary.totals.processed).toBe(2);
    expect(summary.totals.failed).toBe(1);
    expect(summary.totals.succeeded).toBe(1);
    expect(summary.items.find((item) => item.label === "wrong")?.status).toBe("failed");
    expect(summary.items.find((item) => item.label === "wrong")?.error).toContain("Strict match failed");

    const requested = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(requested.some((url) => url === wrongPdf)).toBe(false);
    expect(requested.some((url) => url === rightPdf)).toBe(true);
  });

  it("fails fast without --continue-on-error", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ingest-batch-"));
    const outDir = path.join(root, "out");
    const cacheDir = path.join(root, "cache");
    const summaryOut = path.join(outDir, "summary.json");
    createdDirs.push(root);

    const manifestPath = await writeManifest(root, [
      { contest: "AMC12", year: 2025, exam: "B", label: "wrong" },
      { contest: "AMC12", year: 2025, exam: "A", label: "right" }
    ]);

    const wrongPdf = "https://artofproblemsolving.com/community/contest/download/c111_amc_10/2023";
    const rightPdf = "https://artofproblemsolving.com/community/contest/download/c100_amc_12/2025";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("title=2025_AMC_12B")) {
        return new Response(`<a href=\"${wrongPdf}\">PDF</a>`, { status: 200 });
      }
      if (url.includes("title=2025_AMC_12A")) {
        return new Response(`<a href=\"${rightPdf}\">PDF</a>`, { status: 200 });
      }
      if (url === rightPdf) {
        return new Response(Buffer.from("%PDF-1.7\nright"), {
          status: 200,
          headers: { "content-type": "application/pdf" }
        });
      }
      return new Response("not found", { status: 404 });
    });

    await expect(
      fetchOfficialPdfBatch({
        manifestPath,
        outDir,
        summaryOut,
        concurrency: 1,
        strictMatch: true,
        continueOnError: false,
        skipExisting: false,
        cacheDir,
        cacheOnly: false,
        refresh: true,
        delayMs: 0
      })
    ).rejects.toThrow("Batch aborted on first failure");

    const persisted = JSON.parse(await readFile(summaryOut, "utf8")) as {
      totals: { processed: number; failed: number; succeeded: number };
      items: Array<{ label?: string; status: string }>;
    };

    expect(persisted.totals.processed).toBe(1);
    expect(persisted.totals.failed).toBe(1);
    expect(persisted.totals.succeeded).toBe(0);
    expect(persisted.items).toHaveLength(1);
    expect(persisted.items[0]?.status).toBe("failed");
  });
});
