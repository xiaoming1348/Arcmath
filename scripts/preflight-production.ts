import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../packages/db/src/client";

export type StorageDriver = "local" | "s3";

type EnvMap = Record<string, string | undefined>;

type PreflightResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const REQUIRED_BASE_ENV = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "PASSWORD_PEPPER",
  "OFFICIAL_PDF_STORAGE_DRIVER"
] as const;

const REQUIRED_S3_ENV = ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;

const REQUIRED_SCHEMA_COLUMNS: Record<string, string[]> = {
  ProblemSet: [
    "id",
    "contest",
    "year",
    "exam",
    "title",
    "cachedPdfPath",
    "cachedPdfSha256",
    "cachedPdfSize",
    "cachedPdfAt",
    "cachedPdfStatus",
    "cachedPdfError",
    "createdAt",
    "updatedAt"
  ],
  Problem: ["id", "problemSetId", "number", "statement", "choices", "answer"],
  UserResourceAccess: ["id", "userId", "problemSetId"]
};

function normalizeDriver(value: string | undefined): StorageDriver {
  return value === "s3" ? "s3" : "local";
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function runEnvPreflight(env: EnvMap): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED_BASE_ENV) {
    if (!hasValue(env[key])) {
      errors.push(`Missing required env var: ${key}`);
    }
  }

  const driver = normalizeDriver(env.OFFICIAL_PDF_STORAGE_DRIVER);
  if (driver === "s3") {
    for (const key of REQUIRED_S3_ENV) {
      if (!hasValue(env[key])) {
        errors.push(`Missing required S3 env var: ${key}`);
      }
    }
  } else {
    warnings.push("OFFICIAL_PDF_STORAGE_DRIVER=local (dev-friendly). Production recommendation is s3.");
    if (env.NODE_ENV === "production") {
      errors.push("OFFICIAL_PDF_STORAGE_DRIVER=local is not allowed for NODE_ENV=production.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

async function loadColumns(tableName: string): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND lower(table_name) = lower($1)`,
    tableName
  );
  return new Set(rows.map((row) => row.column_name.toLowerCase()));
}

export async function runSchemaPreflight(): Promise<PreflightResult> {
  const errors: string[] = [];

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_SCHEMA_COLUMNS)) {
    const columns = await loadColumns(tableName);
    for (const column of requiredColumns) {
      if (!columns.has(column.toLowerCase())) {
        errors.push(`Missing DB column: ${tableName}.${column}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings: []
  };
}

export async function runProductionPreflight(env: EnvMap = process.env): Promise<PreflightResult> {
  const envResult = runEnvPreflight(env);
  if (!envResult.ok) {
    return envResult;
  }

  try {
    const schemaResult = await runSchemaPreflight();
    return {
      ok: schemaResult.ok,
      errors: [...envResult.errors, ...schemaResult.errors],
      warnings: [...envResult.warnings, ...schemaResult.warnings]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      errors: [...envResult.errors, `Database preflight failed: ${message}`],
      warnings: envResult.warnings
    };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

function printResult(result: PreflightResult): void {
  console.log("Production preflight summary");
  console.log(`  ok: ${result.ok ? "true" : "false"}`);
  console.log(`  errors: ${result.errors.length}`);
  for (const error of result.errors) {
    console.log(`  - ${error}`);
  }
  console.log(`  warnings: ${result.warnings.length}`);
  for (const warning of result.warnings) {
    console.log(`  - ${warning}`);
  }
}

async function main(): Promise<void> {
  const result = await runProductionPreflight(process.env);
  printResult(result);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === currentPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
