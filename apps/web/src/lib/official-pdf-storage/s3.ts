import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { OfficialPdfStorage } from "./types";

const DEFAULT_PRESIGNED_URL_TTL_SECONDS = 300;

function createSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sanitizeProblemSetId(problemSetId: string): string {
  return problemSetId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizePrefix(prefix: string | undefined): string {
  const trimmed = (prefix ?? "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed.length > 0 ? `${trimmed}/` : "";
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

export type S3OfficialPdfStorageOptions = {
  bucket?: string;
  region?: string;
  endpoint?: string;
  keyPrefix?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  presignedUrlTtlSeconds?: number;
  client?: S3Client;
};

export function buildS3Locator(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`;
}

export function parseS3Locator(locator: string): { bucket: string; key: string } | null {
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

function readRequiredS3ConfigFromEnv(): Required<
  Pick<S3OfficialPdfStorageOptions, "bucket" | "region" | "accessKeyId" | "secretAccessKey">
> &
  Pick<S3OfficialPdfStorageOptions, "endpoint" | "keyPrefix" | "forcePathStyle"> {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 storage driver requires S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }

  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  const keyPrefix = process.env.S3_KEY_PREFIX?.trim() || undefined;
  const forcePathStyle = (process.env.S3_FORCE_PATH_STYLE ?? "false").toLowerCase() === "true";

  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint,
    keyPrefix,
    forcePathStyle
  };
}

function createS3Client(config: {
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

export function createS3OfficialPdfStorage(options?: S3OfficialPdfStorageOptions): OfficialPdfStorage {
  const envConfig = readRequiredS3ConfigFromEnv();
  const bucket = options?.bucket ?? envConfig.bucket;
  const region = options?.region ?? envConfig.region;
  const endpoint = options?.endpoint ?? envConfig.endpoint;
  const keyPrefix = normalizePrefix(options?.keyPrefix ?? envConfig.keyPrefix);
  const forcePathStyle = options?.forcePathStyle ?? envConfig.forcePathStyle;
  const accessKeyId = options?.accessKeyId ?? envConfig.accessKeyId;
  const secretAccessKey = options?.secretAccessKey ?? envConfig.secretAccessKey;
  const presignedUrlTtlSeconds = options?.presignedUrlTtlSeconds ?? DEFAULT_PRESIGNED_URL_TTL_SECONDS;

  const client =
    options?.client ??
    createS3Client({
      region,
      endpoint,
      forcePathStyle,
      accessKeyId,
      secretAccessKey
    });

  function buildObjectKey(problemSetId: string): string {
    const safeId = sanitizeProblemSetId(problemSetId);
    return `${keyPrefix}${safeId}.pdf`;
  }

  function locatorToBucketAndKey(locator: string): { bucket: string; key: string } {
    const parsed = parseS3Locator(locator);
    if (!parsed) {
      throw new Error(`Invalid S3 locator: ${locator}`);
    }
    return parsed;
  }

  return {
    driver: "s3",
    getLocator(problemSetId: string) {
      return buildS3Locator(bucket, buildObjectKey(problemSetId));
    },
    async putPdf(problemSetId, bytes) {
      const key = buildObjectKey(problemSetId);
      const sha256 = createSha256(bytes);

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: "application/pdf",
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
        const { bucket: targetBucket, key } = locatorToBucketAndKey(locator);
        await client.send(
          new HeadObjectCommand({
            Bucket: targetBucket,
            Key: key
          })
        );
        return true;
      } catch (error) {
        if (isMissingObjectError(error)) {
          return false;
        }
        throw error;
      }
    },
    async getDownloadResponse(locator, _filename) {
      const { bucket: targetBucket, key } = locatorToBucketAndKey(locator);
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: targetBucket,
          Key: key,
          ResponseContentType: "application/pdf"
        }),
        {
          expiresIn: presignedUrlTtlSeconds
        }
      );

      return {
        type: "redirect",
        url
      };
    },
    async readMetadata(locator) {
      try {
        const { bucket: targetBucket, key } = locatorToBucketAndKey(locator);
        const head = await client.send(
          new HeadObjectCommand({
            Bucket: targetBucket,
            Key: key
          })
        );

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
    }
  };
}
