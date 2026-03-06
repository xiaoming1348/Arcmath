import { describe, expect, it } from "vitest";
import { runEnvPreflight } from "./preflight-production";

describe("production preflight env checks", () => {
  it("requires S3 env in s3 mode", () => {
    const result = runEnvPreflight({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/arcmath?schema=public",
      NEXTAUTH_URL: "https://app.example.com",
      NEXTAUTH_SECRET: "secret",
      PASSWORD_PEPPER: "pepper",
      OFFICIAL_PDF_STORAGE_DRIVER: "s3"
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("S3_BUCKET"))).toBe(true);
  });

  it("allows local mode but warns in non-production", () => {
    const result = runEnvPreflight({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/arcmath?schema=public",
      NEXTAUTH_URL: "http://localhost:3000",
      NEXTAUTH_SECRET: "secret",
      PASSWORD_PEPPER: "pepper",
      OFFICIAL_PDF_STORAGE_DRIVER: "local",
      NODE_ENV: "development"
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
