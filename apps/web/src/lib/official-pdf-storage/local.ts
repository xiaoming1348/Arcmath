import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, createReadStream } from "node:fs";
import { access, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { NextResponse } from "next/server";
import type { OfficialPdfStorage } from "./types";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");
const DEFAULT_CACHE_ROOT = path.join(PROJECT_ROOT, "tmp/official-pdfs");

function createSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sanitizeProblemSetId(problemSetId: string): string {
  return problemSetId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function ensureFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export type LocalOfficialPdfStorageOptions = {
  cacheRootDir?: string;
};

export function resolveOfficialPdfCacheRoot(cacheRootDir?: string): string {
  if (cacheRootDir) {
    return cacheRootDir;
  }

  const envCacheDir = process.env.OFFICIAL_PDF_CACHE_DIR?.trim();
  if (envCacheDir) {
    return path.isAbsolute(envCacheDir) ? envCacheDir : path.resolve(PROJECT_ROOT, envCacheDir);
  }

  return DEFAULT_CACHE_ROOT;
}

export function getLocalOfficialPdfPath(problemSetId: string, options?: LocalOfficialPdfStorageOptions): string {
  const safeId = sanitizeProblemSetId(problemSetId);
  return path.join(resolveOfficialPdfCacheRoot(options?.cacheRootDir), `${safeId}.pdf`);
}

export function createLocalOfficialPdfStorage(options?: LocalOfficialPdfStorageOptions): OfficialPdfStorage {
  const cacheRoot = resolveOfficialPdfCacheRoot(options?.cacheRootDir);

  return {
    driver: "local",
    getLocator(problemSetId: string) {
      return getLocalOfficialPdfPath(problemSetId, options);
    },
    async putPdf(problemSetId, bytes) {
      const locator = getLocalOfficialPdfPath(problemSetId, options);
      await mkdir(cacheRoot, { recursive: true });

      const tempPath = `${locator}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
      await writeFile(tempPath, bytes);
      try {
        await rename(tempPath, locator);
      } catch (error) {
        await unlink(tempPath).catch(() => undefined);
        throw error;
      }

      return {
        locator,
        size: bytes.length,
        sha256: createSha256(bytes)
      };
    },
    async exists(locator) {
      return ensureFileExists(locator);
    },
    async getDownloadResponse(locator, filename) {
      const exists = await ensureFileExists(locator);
      if (!exists) {
        return null;
      }

      const fileStat = await stat(locator);
      const nodeStream = createReadStream(locator);
      const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
      return {
        type: "response",
        response: new NextResponse(stream, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": String(fileStat.size),
            "Cache-Control": "no-store"
          }
        })
      };
    },
    async readMetadata(locator) {
      const exists = await ensureFileExists(locator);
      if (!exists) {
        return null;
      }

      const [bytes, fileStat] = await Promise.all([readFile(locator), stat(locator)]);
      return {
        locator,
        size: fileStat.size,
        sha256: createSha256(Buffer.from(bytes))
      };
    }
  };
}
