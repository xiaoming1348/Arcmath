// Intentionally empty: the v2 rubric columns are surfaced via a
// typed cast inside `apps/web/src/lib/trpc/routers/rubric.ts` instead
// of a Prisma type augmentation (Prisma's generated types are
// `type` aliases, not interfaces, so module augmentation is a no-op
// for them). Kept as a placeholder so the file path is reserved for
// future Prisma-related augmentations that DO work (e.g. enums).

export {};
