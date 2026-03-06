import { fileURLToPath } from "node:url";
import { defineWorkspace } from "vitest/config";

const sharedEntry = fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url));
const dbEntry = fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url));

export default defineWorkspace([
  "apps/web/vitest.config.ts",
  {
    resolve: {
      alias: {
        "@arcmath/db": dbEntry
      }
    },
    test: {
      name: "scripts",
      include: ["scripts/**/*.test.ts"],
      environment: "node",
      passWithNoTests: true
    }
  },
  {
    resolve: {
      alias: {
        "@arcmath/shared": sharedEntry
      }
    },
    test: {
      name: "db",
      include: ["packages/db/**/*.test.ts"],
      environment: "node",
      passWithNoTests: true
    }
  },
  {
    test: {
      name: "shared",
      include: ["packages/shared/**/*.test.ts"],
      environment: "node",
      passWithNoTests: true
    }
  },
  {
    resolve: {
      alias: {
        "@arcmath/shared": sharedEntry
      }
    },
    test: {
      name: "ingest",
      include: ["packages/ingest-aops/**/*.test.ts"],
      environment: "node",
      passWithNoTests: true
    }
  }
]);
