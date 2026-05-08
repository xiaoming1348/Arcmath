export { prisma } from "./client";
export * from "@prisma/client";
// Sentinel tenant surface — the slug + display name are safe for any
// caller to import (pure strings). The `ensureArcmathOpsSentinel`
// helper is imported directly from prisma seed via a relative path and
// doesn't need to sit on the public barrel.
export {
  ARCMATH_OPS_SENTINEL_SLUG,
  ARCMATH_OPS_SENTINEL_NAME
} from "./ops-sentinel";
