import { afterEach, describe, expect, it } from "vitest";
import {
  createOfficialPdfStorage,
  getOfficialPdfStorageDriver,
  resetOfficialPdfStorageForTests
} from "@/lib/official-pdf-storage";

describe("official pdf storage factory", () => {
  const previousDriver = process.env.OFFICIAL_PDF_STORAGE_DRIVER;

  afterEach(() => {
    process.env.OFFICIAL_PDF_STORAGE_DRIVER = previousDriver;
    resetOfficialPdfStorageForTests();
  });

  it("defaults to local driver", () => {
    delete process.env.OFFICIAL_PDF_STORAGE_DRIVER;
    expect(getOfficialPdfStorageDriver()).toBe("local");

    const storage = createOfficialPdfStorage({ driver: "local" });
    expect(storage.driver).toBe("local");
  });

  it("reads s3 driver from env value", () => {
    process.env.OFFICIAL_PDF_STORAGE_DRIVER = "s3";
    expect(getOfficialPdfStorageDriver()).toBe("s3");
  });

  it("normalizes unknown driver values back to local", () => {
    process.env.OFFICIAL_PDF_STORAGE_DRIVER = "something-else";
    expect(getOfficialPdfStorageDriver()).toBe("local");
  });
});
