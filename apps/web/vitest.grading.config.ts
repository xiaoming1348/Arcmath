// Sandbox-friendly vitest config: same path aliases as the main config,
// but CSS / PostCSS is disabled so the linux-sandbox doesn't trip over
// Tailwind/lightningcss native bindings that were installed for darwin.
//
// Use only for the v2 grading-engine unit tests.
//
//   npx vitest run --config vitest.grading.config.ts src/lib/grading
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Hand Vite an inline PostCSS config so it does not discover the
  // project's postcss.config.mjs (which pulls in @tailwindcss/postcss →
  // lightningcss native bindings and dies on a non-darwin sandbox).
  css: { postcss: { plugins: [] } },
  test: {
    name: "web-grading",
    environment: "node",
    include: [
      "src/lib/grading/**/*.test.ts",
      "src/scripts/grading-eval/**/*.test.ts"
    ]
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  }
});
