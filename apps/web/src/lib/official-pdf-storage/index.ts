import { createLocalOfficialPdfStorage, type LocalOfficialPdfStorageOptions } from "./local";
import { createS3OfficialPdfStorage } from "./s3";
import type { OfficialPdfStorage } from "./types";

export type OfficialPdfStorageDriver = "local" | "s3";

type OfficialPdfStorageFactoryOptions = {
  driver?: OfficialPdfStorageDriver;
  local?: LocalOfficialPdfStorageOptions;
};

let cachedStorage: {
  key: string;
  instance: OfficialPdfStorage;
} | null = null;

function normalizeDriver(value: string | undefined): OfficialPdfStorageDriver {
  if (value === "s3") {
    return "s3";
  }
  return "local";
}

function buildStorageCacheKey(driver: OfficialPdfStorageDriver): string {
  if (driver === "local") {
    return `local:${process.env.OFFICIAL_PDF_CACHE_DIR ?? ""}`;
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

export function getOfficialPdfStorageDriver(): OfficialPdfStorageDriver {
  return normalizeDriver(process.env.OFFICIAL_PDF_STORAGE_DRIVER?.trim().toLowerCase());
}

export function createOfficialPdfStorage(options?: OfficialPdfStorageFactoryOptions): OfficialPdfStorage {
  const driver = options?.driver ?? getOfficialPdfStorageDriver();

  if (driver === "s3") {
    return createS3OfficialPdfStorage();
  }

  return createLocalOfficialPdfStorage(options?.local);
}

export function getOfficialPdfStorage(options?: OfficialPdfStorageFactoryOptions): OfficialPdfStorage {
  if (options?.driver || options?.local?.cacheRootDir) {
    return createOfficialPdfStorage(options);
  }

  const driver = getOfficialPdfStorageDriver();
  const key = buildStorageCacheKey(driver);

  if (cachedStorage && cachedStorage.key === key) {
    return cachedStorage.instance;
  }

  const instance = createOfficialPdfStorage({ driver });
  cachedStorage = { key, instance };
  return instance;
}

export function resetOfficialPdfStorageForTests(): void {
  cachedStorage = null;
}

export type {
  OfficialPdfStorage,
  OfficialPdfDownloadResult,
  OfficialPdfStoredMetadata,
  OfficialPdfStoredObject
} from "./types";
export { createLocalOfficialPdfStorage, getLocalOfficialPdfPath, resolveOfficialPdfCacheRoot } from "./local";
export { buildS3Locator, createS3OfficialPdfStorage, parseS3Locator } from "./s3";
