import { createHash } from "node:crypto";
import type { NextResponse } from "next/server";
import {
  createOfficialPdfStorage,
  getLocalOfficialPdfPath,
  getOfficialPdfStorage,
  resolveOfficialPdfCacheRoot
} from "./official-pdf-storage";

const REQUEST_TIMEOUT_MS = 10_000;

export type OfficialPdfCacheMetadata = {
  path: string;
  size: number;
  sha256: string;
};

export type CachedPdfStreamResult = {
  path: string;
  size: number;
  stream: ReadableStream<Uint8Array>;
};

type CacheOptions = {
  cacheRootDir?: string;
};

export type CachedPdfDownloadResult =
  | {
      type: "response";
      response: NextResponse;
      locator: string;
    }
  | {
      type: "redirect";
      url: string;
      locator: string;
    };

export { resolveOfficialPdfCacheRoot };

function createSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isLikelyPdfByContentType(contentType: string | null): boolean {
  return (contentType ?? "").toLowerCase().includes("application/pdf");
}

function hasPdfSignature(bytes: Buffer): boolean {
  if (bytes.length < 5) {
    return false;
  }
  return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getStorage(options?: CacheOptions) {
  if (options?.cacheRootDir) {
    return createOfficialPdfStorage({
      driver: "local",
      local: {
        cacheRootDir: options.cacheRootDir
      }
    });
  }

  return getOfficialPdfStorage();
}

function dedupeLocators(locators: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const locator of locators) {
    const normalized = locator?.trim();
    if (!normalized) {
      continue;
    }
    seen.add(normalized);
  }
  return [...seen];
}

export function getOfficialPdfCachePath(problemSetId: string, options?: CacheOptions): string {
  return getLocalOfficialPdfPath(problemSetId, {
    cacheRootDir: options?.cacheRootDir
  });
}

export async function hasCachedOfficialPdf(problemSetId: string, options?: CacheOptions): Promise<boolean> {
  const storage = getStorage(options);
  return storage.exists(storage.getLocator(problemSetId));
}

export async function readCachedOfficialPdfMetadata(
  problemSetId: string,
  options?: CacheOptions
): Promise<OfficialPdfCacheMetadata | null> {
  const storage = getStorage(options);
  const locator = storage.getLocator(problemSetId);
  const exists = await storage.exists(locator);
  if (!exists) {
    return null;
  }

  const metadata = await storage.readMetadata(locator);
  return {
    path: metadata?.locator ?? locator,
    size: metadata?.size ?? 0,
    sha256: metadata?.sha256 ?? ""
  };
}

export async function getCachedOfficialPdfStream(
  problemSetId: string,
  options?: CacheOptions
): Promise<CachedPdfStreamResult | null> {
  const storage = getStorage(options);
  if (storage.driver !== "local") {
    return null;
  }

  const locator = storage.getLocator(problemSetId);
  const download = await storage.getDownloadResponse(locator, "official.pdf");
  if (!download || download.type !== "response" || !download.response.body) {
    return null;
  }

  return {
    path: locator,
    size: Number(download.response.headers.get("content-length") ?? "0"),
    stream: download.response.body as ReadableStream<Uint8Array>
  };
}

export async function getCachedOfficialPdfDownload(input: {
  problemSetId: string;
  filename: string;
  locator?: string | null;
  cacheRootDir?: string;
}): Promise<CachedPdfDownloadResult | null> {
  const storage = getStorage({ cacheRootDir: input.cacheRootDir });
  const fallbackLocator = storage.getLocator(input.problemSetId);
  const candidates = dedupeLocators([input.locator, fallbackLocator]);

  for (const locator of candidates) {
    let exists = false;
    try {
      exists = await storage.exists(locator);
    } catch {
      continue;
    }
    if (!exists) {
      continue;
    }

    let download: Awaited<ReturnType<typeof storage.getDownloadResponse>>;
    try {
      download = await storage.getDownloadResponse(locator, input.filename);
    } catch {
      continue;
    }
    if (!download) {
      continue;
    }

    if (download.type === "response") {
      return {
        type: "response",
        response: download.response,
        locator
      };
    }

    return {
      type: "redirect",
      url: download.url,
      locator
    };
  }

  return null;
}

export async function cacheOfficialPdfFromUrl(input: {
  problemSetId: string;
  pdfUrl: string;
  force?: boolean;
  cacheRootDir?: string;
}): Promise<OfficialPdfCacheMetadata> {
  const { problemSetId, pdfUrl, force = false, cacheRootDir } = input;
  const storage = getStorage({ cacheRootDir });
  const locator = storage.getLocator(problemSetId);

  if (!force) {
    const exists = await storage.exists(locator);
    if (exists) {
      const existing = await storage.readMetadata(locator);
      if (existing?.size !== null && existing?.sha256) {
        return {
          path: existing.locator,
          size: existing.size,
          sha256: existing.sha256
        };
      }
    }
  }

  const response = await fetchWithTimeout(pdfUrl);
  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type");
  const isPdf = isLikelyPdfByContentType(contentType) || hasPdfSignature(bytes);
  if (!isPdf) {
    throw new Error("Downloaded file is not a valid PDF.");
  }

  const stored = await storage.putPdf(problemSetId, bytes);
  const expectedSha = createSha256(bytes);

  return {
    path: stored.locator,
    size: stored.size,
    sha256: stored.sha256 || expectedSha
  };
}

export async function cacheOfficialPdfBytes(input: {
  problemSetId: string;
  bytes: Buffer;
  force?: boolean;
  cacheRootDir?: string;
}): Promise<OfficialPdfCacheMetadata> {
  const { problemSetId, bytes, force = false, cacheRootDir } = input;
  const storage = getStorage({ cacheRootDir });
  const locator = storage.getLocator(problemSetId);

  if (!force) {
    const exists = await storage.exists(locator);
    if (exists) {
      const existing = await storage.readMetadata(locator);
      if (existing?.size !== null && existing?.sha256) {
        return {
          path: existing.locator,
          size: existing.size,
          sha256: existing.sha256
        };
      }
    }
  }

  if (!hasPdfSignature(bytes)) {
    throw new Error("Provided bytes do not have a valid PDF signature.");
  }

  const stored = await storage.putPdf(problemSetId, bytes);
  const expectedSha = createSha256(bytes);

  return {
    path: stored.locator,
    size: stored.size,
    sha256: stored.sha256 || expectedSha
  };
}
