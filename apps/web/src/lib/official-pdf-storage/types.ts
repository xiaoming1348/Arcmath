import type { NextResponse } from "next/server";

export type OfficialPdfStoredObject = {
  locator: string;
  size: number;
  sha256: string;
};

export type OfficialPdfStoredMetadata = {
  locator: string;
  size: number | null;
  sha256: string | null;
};

export type OfficialPdfDownloadResult =
  | {
      type: "response";
      response: NextResponse;
    }
  | {
      type: "redirect";
      url: string;
    };

export interface OfficialPdfStorage {
  readonly driver: "local" | "s3";
  getLocator(problemSetId: string): string;
  putPdf(problemSetId: string, bytes: Buffer): Promise<OfficialPdfStoredObject>;
  exists(locator: string): Promise<boolean>;
  getDownloadResponse(locator: string, filename: string): Promise<OfficialPdfDownloadResult | null>;
  readMetadata(locator: string): Promise<OfficialPdfStoredMetadata | null>;
}
