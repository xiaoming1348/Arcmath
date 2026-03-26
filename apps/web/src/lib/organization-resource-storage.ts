import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, createReadStream } from "node:fs";
import { access, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
const DEFAULT_LOCAL_ROOT = path.join(PROJECT_ROOT, "tmp/org-resources");
const DEFAULT_S3_TTL_SECONDS = 300;

type Driver = "local" | "s3";

export type OrganizationResourceStoredObject = {
  locator: string;
  size: number;
  sha256: string;
};

export type OrganizationResourceDownloadResult =
  | { type: "response"; response: NextResponse }
  | { type: "redirect"; url: string };

type StoredMetadata = {
  locator: string;
  size: number | null;
  sha256: string | null;
};

interface OrganizationResourceStorage {
  readonly driver: Driver;
  putFile(resourceId: string, filename: string, mimeType: string, bytes: Buffer): Promise<OrganizationResourceStoredObject>;
  exists(locator: string): Promise<boolean>;
  readMetadata(locator: string): Promise<StoredMetadata | null>;
  getDownloadResponse(locator: string, filename: string, mimeType: string | null): Promise<OrganizationResourceDownloadResult | null>;
}

function normalizeDriver(value: string | undefined): Driver {
  if (value?.trim().toLowerCase() === "s3") {
    return "s3";
  }
  return "local";
}

function createSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function ensureFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveLocalRoot(): string {
  const envDir = process.env.ORG_RESOURCE_CACHE_DIR?.trim();
  if (!envDir) {
    return DEFAULT_LOCAL_ROOT;
  }
  return path.isAbsolute(envDir) ? envDir : path.resolve(PROJECT_ROOT, envDir);
}

function normalizePrefix(prefix: string | undefined): string {
  const trimmed = (prefix ?? "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed.length > 0 ? `${trimmed}/` : "";
}

function buildObjectKey(resourceId: string, filename: string): string {
  const safeId = sanitizeSegment(resourceId);
  const safeFilename = sanitizeSegment(filename) || "attachment.bin";
  return `org-resources/${safeId}/${safeFilename}`;
}

function buildS3Locator(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`;
}

function parseS3Locator(locator: string): { bucket: string; key: string } | null {
  if (!locator.startsWith("s3://")) {
    return null;
  }

  const withoutScheme = locator.slice("s3://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex <= 0) {
    return null;
  }

  const bucket = withoutScheme.slice(0, slashIndex);
  const key = withoutScheme.slice(slashIndex + 1);
  if (!bucket || !key) {
    return null;
  }

  return { bucket, key };
}

function isMissingObjectError(error: unknown): boolean {
  if (error instanceof NoSuchKey) {
    return true;
  }

  if (error instanceof S3ServiceException) {
    return error.$metadata.httpStatusCode === 404 || error.name === "NotFound";
  }

  if (typeof error === "object" && error !== null && "name" in error) {
    const name = String((error as { name?: string }).name ?? "");
    return name === "NotFound" || name === "NoSuchKey";
  }

  return false;
}

function createLocalStorage(): OrganizationResourceStorage {
  const root = resolveLocalRoot();

  return {
    driver: "local",
    async putFile(resourceId, filename, _mimeType, bytes) {
      const relativePath = buildObjectKey(resourceId, filename);
      const locator = path.join(root, relativePath);
      await mkdir(path.dirname(locator), { recursive: true });
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
    },
    async getDownloadResponse(locator, filename, mimeType) {
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
            "Content-Type": mimeType || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": String(fileStat.size),
            "Cache-Control": "no-store"
          }
        })
      };
    }
  };
}

function createS3Storage(): OrganizationResourceStorage {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 storage driver requires S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.");
  }

  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  const keyPrefix = normalizePrefix(process.env.S3_KEY_PREFIX?.trim()) || "";
  const forcePathStyle = (process.env.S3_FORCE_PATH_STYLE ?? "false").toLowerCase() === "true";

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  return {
    driver: "s3",
    async putFile(resourceId, filename, mimeType, bytes) {
      const key = `${keyPrefix}${buildObjectKey(resourceId, filename)}`;
      const sha256 = createSha256(bytes);

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: mimeType || "application/octet-stream",
          ContentLength: bytes.length,
          Metadata: {
            sha256
          }
        })
      );

      return {
        locator: buildS3Locator(bucket, key),
        size: bytes.length,
        sha256
      };
    },
    async exists(locator) {
      try {
        const parsed = parseS3Locator(locator);
        if (!parsed) {
          return false;
        }
        await client.send(new HeadObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
        return true;
      } catch (error) {
        if (isMissingObjectError(error)) {
          return false;
        }
        throw error;
      }
    },
    async readMetadata(locator) {
      try {
        const parsed = parseS3Locator(locator);
        if (!parsed) {
          return null;
        }
        const head = await client.send(new HeadObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
        return {
          locator,
          size: typeof head.ContentLength === "number" ? head.ContentLength : null,
          sha256: head.Metadata?.sha256 ?? null
        };
      } catch (error) {
        if (isMissingObjectError(error)) {
          return null;
        }
        throw error;
      }
    },
    async getDownloadResponse(locator, _filename, mimeType) {
      const parsed = parseS3Locator(locator);
      if (!parsed) {
        return null;
      }
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: parsed.bucket,
          Key: parsed.key,
          ResponseContentType: mimeType || "application/octet-stream"
        }),
        { expiresIn: DEFAULT_S3_TTL_SECONDS }
      );
      return {
        type: "redirect",
        url
      };
    }
  };
}

let cachedStorage: { key: string; instance: OrganizationResourceStorage } | null = null;

function buildCacheKey(driver: Driver): string {
  if (driver === "local") {
    return `local:${resolveLocalRoot()}`;
  }

  return [
    "s3",
    process.env.S3_BUCKET ?? "",
    process.env.S3_REGION ?? "",
    process.env.S3_ENDPOINT ?? "",
    process.env.S3_KEY_PREFIX ?? "",
    process.env.S3_FORCE_PATH_STYLE ?? "false"
  ].join(":");
}

export function getOrganizationResourceStorage(): OrganizationResourceStorage {
  const driver = normalizeDriver(process.env.OFFICIAL_PDF_STORAGE_DRIVER);
  const key = buildCacheKey(driver);

  if (cachedStorage && cachedStorage.key === key) {
    return cachedStorage.instance;
  }

  const instance = driver === "s3" ? createS3Storage() : createLocalStorage();
  cachedStorage = { key, instance };
  return instance;
}
