import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLocalOfficialPdfStorage,
  getLocalOfficialPdfPath,
  resolveOfficialPdfCacheRoot
} from "@/lib/official-pdf-storage";

describe("local official pdf storage", () => {
  const createdDirs: string[] = [];
  const previousCacheDir = process.env.OFFICIAL_PDF_CACHE_DIR;

  afterEach(async () => {
    process.env.OFFICIAL_PDF_CACHE_DIR = previousCacheDir;
    for (const dir of createdDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stores, checks, reads metadata, and serves download response", async () => {
    const cacheRootDir = await mkdtemp(path.join(tmpdir(), "local-pdf-storage-"));
    createdDirs.push(cacheRootDir);

    const storage = createLocalOfficialPdfStorage({ cacheRootDir });
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
    const put = await storage.putPdf("set_abc", bytes);

    expect(put.locator).toBe(getLocalOfficialPdfPath("set_abc", { cacheRootDir }));
    expect(put.size).toBe(bytes.length);
    expect(put.sha256).toHaveLength(64);

    const exists = await storage.exists(put.locator);
    expect(exists).toBe(true);

    const metadata = await storage.readMetadata(put.locator);
    expect(metadata?.locator).toBe(put.locator);
    expect(metadata?.size).toBe(bytes.length);
    expect(metadata?.sha256).toBe(put.sha256);

    const download = await storage.getDownloadResponse(put.locator, "set_abc.pdf");
    expect(download?.type).toBe("response");
    if (!download || download.type !== "response") {
      throw new Error("expected local response download");
    }

    expect(download.response.headers.get("content-type")).toBe("application/pdf");
    expect(download.response.headers.get("content-disposition")).toContain("set_abc.pdf");

    const downloadedBytes = Buffer.from(await download.response.arrayBuffer());
    expect(downloadedBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("resolves cache root from env", () => {
    process.env.OFFICIAL_PDF_CACHE_DIR = "custom-cache-root";
    const root = resolveOfficialPdfCacheRoot();
    expect(root).toContain("custom-cache-root");
  });
});
