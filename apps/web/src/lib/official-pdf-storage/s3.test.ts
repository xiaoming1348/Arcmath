import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock, getSignedUrlMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  getSignedUrlMock: vi.fn()
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = sendMock;
  }

  class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }

  class HeadObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }

  class GetObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }

  class S3ServiceException extends Error {
    $metadata: { httpStatusCode?: number };
    constructor(options?: { name?: string; httpStatusCode?: number }) {
      super(options?.name ?? "S3ServiceException");
      this.name = options?.name ?? "S3ServiceException";
      this.$metadata = { httpStatusCode: options?.httpStatusCode };
    }
  }

  class NoSuchKey extends Error {
    constructor(_opts?: unknown) {
      super("NoSuchKey");
      this.name = "NoSuchKey";
    }
  }

  return {
    S3Client,
    PutObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
    S3ServiceException,
    NoSuchKey
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock
}));

import { NoSuchKey } from "@aws-sdk/client-s3";
import {
  buildS3Locator,
  createS3OfficialPdfStorage,
  parseS3Locator
} from "@/lib/official-pdf-storage";

describe("s3 official pdf storage", () => {
  const previousEnv = {
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_KEY_PREFIX: process.env.S3_KEY_PREFIX,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE
  };

  beforeEach(() => {
    sendMock.mockReset();
    getSignedUrlMock.mockReset();

    process.env.S3_BUCKET = "test-bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ACCESS_KEY_ID = "ak";
    process.env.S3_SECRET_ACCESS_KEY = "sk";
    process.env.S3_KEY_PREFIX = "official-pdfs";
    process.env.S3_FORCE_PATH_STYLE = "true";
  });

  afterEach(() => {
    process.env.S3_BUCKET = previousEnv.S3_BUCKET;
    process.env.S3_REGION = previousEnv.S3_REGION;
    process.env.S3_ACCESS_KEY_ID = previousEnv.S3_ACCESS_KEY_ID;
    process.env.S3_SECRET_ACCESS_KEY = previousEnv.S3_SECRET_ACCESS_KEY;
    process.env.S3_ENDPOINT = previousEnv.S3_ENDPOINT;
    process.env.S3_KEY_PREFIX = previousEnv.S3_KEY_PREFIX;
    process.env.S3_FORCE_PATH_STYLE = previousEnv.S3_FORCE_PATH_STYLE;
  });

  it("builds and parses s3 locators", () => {
    const locator = buildS3Locator("bucket", "prefix/set_1.pdf");
    expect(locator).toBe("s3://bucket/prefix/set_1.pdf");
    expect(parseS3Locator(locator)).toEqual({ bucket: "bucket", key: "prefix/set_1.pdf" });
    expect(parseS3Locator("not-s3")).toBeNull();
  });

  it("uploads PDF bytes and returns deterministic locator", async () => {
    sendMock.mockResolvedValue({});
    const storage = createS3OfficialPdfStorage();

    const result = await storage.putPdf("set:42", Buffer.from("%PDF-test"));

    expect(result.locator).toBe("s3://test-bucket/official-pdfs/set_42.pdf");
    expect(result.size).toBe(9);
    expect(result.sha256).toHaveLength(64);
    expect(sendMock).toHaveBeenCalledTimes(1);

    const firstCommand = sendMock.mock.calls[0]?.[0] as { input?: Record<string, unknown> };
    expect(firstCommand.input?.Bucket).toBe("test-bucket");
    expect(firstCommand.input?.Key).toBe("official-pdfs/set_42.pdf");
    expect(firstCommand.input?.ContentType).toBe("application/pdf");
  });

  it("checks object existence via head and treats NoSuchKey as missing", async () => {
    const storage = createS3OfficialPdfStorage();
    sendMock.mockResolvedValueOnce({});

    const exists = await storage.exists("s3://test-bucket/official-pdfs/set_1.pdf");
    expect(exists).toBe(true);

    sendMock.mockRejectedValueOnce(new NoSuchKey({ $metadata: {}, message: "NoSuchKey" }));
    const missing = await storage.exists("s3://test-bucket/official-pdfs/set_2.pdf");
    expect(missing).toBe(false);
  });

  it("reads head metadata and creates presigned download redirects", async () => {
    const storage = createS3OfficialPdfStorage();
    sendMock.mockResolvedValueOnce({
      ContentLength: 321,
      Metadata: {
        sha256: "a".repeat(64)
      }
    });
    getSignedUrlMock.mockResolvedValue("https://presigned.example.com/file.pdf");

    const locator = "s3://test-bucket/official-pdfs/set_3.pdf";
    const metadata = await storage.readMetadata(locator);
    expect(metadata).toEqual({
      locator,
      size: 321,
      sha256: "a".repeat(64)
    });

    const download = await storage.getDownloadResponse(locator, "set_3.pdf");
    expect(download).toEqual({
      type: "redirect",
      url: "https://presigned.example.com/file.pdf"
    });
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
  });
});
