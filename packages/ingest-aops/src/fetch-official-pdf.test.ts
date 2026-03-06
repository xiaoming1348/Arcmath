import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOfficialPdfArtifact, type OfficialPdfCliFlags } from "./cli";

describe("fetch-official-pdf command", () => {
  const createdDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const dir of createdDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes official pdf and metadata artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ingest-pdf-"));
    const cacheDir = path.join(root, "cache");
    const outDir = path.join(root, "out");
    createdDirs.push(root);

    const expectedPdfUrl = "https://artofproblemsolving.com/community/contest/download/c999_amc_12/2025";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("title=2025_AMC_12A")) {
        return new Response(`<a href="${expectedPdfUrl}">PDF</a>`, { status: 200 });
      }

      if (url === expectedPdfUrl) {
        return new Response(Buffer.from("%PDF-1.7\nmock"), {
          status: 200,
          headers: {
            "content-type": "application/pdf"
          }
        });
      }

      return new Response("not found", { status: 404 });
    });

    const flags: OfficialPdfCliFlags = {
      contest: "AMC12",
      year: 2025,
      exam: "A",
      outDir,
      cacheDir,
      cacheOnly: false,
      refresh: true,
      delayMs: 0,
      strictMatch: false
    };

    const result = await fetchOfficialPdfArtifact(flags);

    await expect(stat(result.pdfPath)).resolves.toBeTruthy();
    await expect(stat(result.metaPath)).resolves.toBeTruthy();

    const pdfBytes = Buffer.from(await readFile(result.pdfPath));
    expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const meta = JSON.parse(await readFile(result.metaPath, "utf8")) as {
      contest: string;
      year: number;
      exam: string | null;
      baseTitle: string;
      examWikiUrl: string;
      discoveredFrom: string;
      pdfUrl: string;
      sha256: string;
      size: number;
      fetchedAt: string;
    };

    expect(meta.contest).toBe("AMC12");
    expect(meta.year).toBe(2025);
    expect(meta.exam).toBe("A");
    expect(meta.baseTitle).toBe("2025_AMC_12A");
    expect(meta.examWikiUrl).toContain("title=2025_AMC_12A");
    expect(meta.discoveredFrom).toContain("title=2025_AMC_12A");
    expect(meta.pdfUrl).toBe(expectedPdfUrl);
    expect(meta.sha256).toHaveLength(64);
    expect(meta.size).toBeGreaterThan(5);
    expect(new Date(meta.fetchedAt).toString()).not.toBe("Invalid Date");
  });

  it("fails when strict-match guard does not match expected identity", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ingest-pdf-"));
    const cacheDir = path.join(root, "cache");
    const outDir = path.join(root, "out");
    createdDirs.push(root);

    const wrongPdfUrl = "https://artofproblemsolving.com/community/contest/download/c111_amc_10/2023";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("title=2025_AMC_12B")) {
        return new Response(`<a href="${wrongPdfUrl}">PDF</a>`, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const flags: OfficialPdfCliFlags = {
      contest: "AMC12",
      year: 2025,
      exam: "B",
      outDir,
      cacheDir,
      cacheOnly: false,
      refresh: true,
      delayMs: 0,
      strictMatch: true
    };

    await expect(fetchOfficialPdfArtifact(flags)).rejects.toThrow("Strict match failed");

    const requestedUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(requestedUrls.some((url) => url === wrongPdfUrl)).toBe(false);
  });
});
