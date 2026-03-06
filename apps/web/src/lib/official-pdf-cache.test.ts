import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cacheOfficialPdfFromUrl,
  getCachedOfficialPdfStream,
  getOfficialPdfCachePath,
  hasCachedOfficialPdf,
  readCachedOfficialPdfMetadata,
  resolveOfficialPdfCacheRoot
} from "@/lib/official-pdf-cache";

describe("official pdf cache helper", () => {
  const createdDirs: string[] = [];
  const previousEnvCacheDir = process.env.OFFICIAL_PDF_CACHE_DIR;
  const previousDriver = process.env.OFFICIAL_PDF_STORAGE_DRIVER;

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env.OFFICIAL_PDF_CACHE_DIR = previousEnvCacheDir;
    process.env.OFFICIAL_PDF_STORAGE_DRIVER = previousDriver;
    for (const dir of createdDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downloads, validates, and caches a PDF file with metadata", async () => {
    const cacheRootDir = await mkdtemp(path.join(tmpdir(), "official-pdf-cache-"));
    createdDirs.push(cacheRootDir);
    process.env.OFFICIAL_PDF_STORAGE_DRIVER = "local";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"), {
        status: 200,
        headers: { "content-type": "application/pdf" }
      })
    );

    const result = await cacheOfficialPdfFromUrl({
      problemSetId: "set_abc",
      pdfUrl: "https://example.com/amc.pdf",
      cacheRootDir
    });

    expect(result.path).toBe(getOfficialPdfCachePath("set_abc", { cacheRootDir }));
    expect(result.size).toBeGreaterThan(10);
    expect(result.sha256).toHaveLength(64);
    expect(await hasCachedOfficialPdf("set_abc", { cacheRootDir })).toBe(true);

    const metadata = await readCachedOfficialPdfMetadata("set_abc", { cacheRootDir });
    expect(metadata?.path).toBe(result.path);
    expect(metadata?.size).toBe(result.size);

    const streamResult = await getCachedOfficialPdfStream("set_abc", { cacheRootDir });
    expect(streamResult?.size).toBe(result.size);
    const bytes = Buffer.from(await readFile(result.path));
    expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("rejects non-pdf downloads", async () => {
    const cacheRootDir = await mkdtemp(path.join(tmpdir(), "official-pdf-cache-"));
    createdDirs.push(cacheRootDir);
    process.env.OFFICIAL_PDF_STORAGE_DRIVER = "local";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>not pdf</html>", {
        status: 200,
        headers: { "content-type": "text/html" }
      })
    );

    await expect(
      cacheOfficialPdfFromUrl({
        problemSetId: "set_html",
        pdfUrl: "https://example.com/not-pdf",
        cacheRootDir
      })
    ).rejects.toThrow("valid PDF");
  });

  it("resolves cache root from OFFICIAL_PDF_CACHE_DIR when set", () => {
    process.env.OFFICIAL_PDF_STORAGE_DRIVER = "local";
    process.env.OFFICIAL_PDF_CACHE_DIR = "custom-cache";
    const resolved = resolveOfficialPdfCacheRoot();
    expect(resolved).toContain("custom-cache");
  });

  it("uses portable default cache root under project tmp directory", () => {
    process.env.OFFICIAL_PDF_STORAGE_DRIVER = "local";
    delete process.env.OFFICIAL_PDF_CACHE_DIR;
    const resolved = resolveOfficialPdfCacheRoot();
    expect(resolved.endsWith(path.join("tmp", "official-pdfs"))).toBe(true);
  });
});
