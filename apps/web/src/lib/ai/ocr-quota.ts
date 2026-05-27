import type { PrismaClient } from "@arcmath/db";
import type { HandwritingOcrResult, HandwritingMultiStepOcrResult } from "./ocr-handwriting";

/**
 * OCR daily quota + call-log helpers (Sprint 2).
 *
 * Why per-user-per-day (vs per-org or per-image-hash):
 *  - Cost containment is the only real driver. GPT-4o vision is
 *    ~$0.005 per call; a single misbehaving client (or a brute-force
 *    student spam-clicking the camera button) could rack up 1000
 *    calls overnight without a per-user limit.
 *  - 50/day comfortably covers normal use: even a power student
 *    working through a STEP paper end-to-end uses maybe 20-30
 *    photos.
 *  - Org-level limits would punish the unlucky student in a
 *    classroom; per-image-hash dedup is a Sprint 3+ optimization
 *    once we have real call data.
 *
 * The ceiling is in env (`OCR_DAILY_QUOTA`, default 50) so we can
 * dial it without redeploying schema changes — useful for the pilot
 * where we'll likely adjust based on observed usage.
 */

const DEFAULT_DAILY_QUOTA = 50;
// Hard upper bound on the env-configurable ceiling. Stops someone
// from accidentally setting OCR_DAILY_QUOTA=99999 and disabling cost
// protection entirely.
const ABSOLUTE_MAX_QUOTA = 500;

export function getConfiguredDailyQuota(): number {
  const raw = process.env.OCR_DAILY_QUOTA;
  if (!raw) return DEFAULT_DAILY_QUOTA;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAILY_QUOTA;
  return Math.min(parsed, ABSOLUTE_MAX_QUOTA);
}

/**
 * Return start-of-day-in-UTC for `now`. We use UTC consistently
 * across the codebase to avoid the "quota resets at midnight in
 * which time zone?" question — pilot users span CN (UTC+8) and US
 * (UTC-7). Picking either user's local midnight would confuse the
 * other; UTC is the neutral choice.
 */
function utcDayStart(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export type QuotaStatus = {
  used: number;
  limit: number;
  /** True if the user has at least one OCR call left today. */
  allowed: boolean;
  /** ISO timestamp when the quota resets (next UTC midnight). */
  resetsAtIso: string;
};

/**
 * Check (don't increment) the user's OCR usage for today. Use this
 * for read-only UI displays — the actual enforcement happens via
 * `requireOcrQuota`, which throws if exceeded.
 */
export async function getOcrQuotaStatus(params: {
  prisma: PrismaClient;
  userId: string;
  now?: Date;
}): Promise<QuotaStatus> {
  const now = params.now ?? new Date();
  const limit = getConfiguredDailyQuota();

  // Cast through unknown because the Prisma client may be a sandbox
  // stub during local dev (before `pnpm prisma generate` runs). The
  // real type appears once the migration has been applied.
  const ocrCallLog = (params.prisma as unknown as {
    ocrCallLog: {
      count: (args: unknown) => Promise<number>;
    };
  }).ocrCallLog;

  const used = await ocrCallLog.count({
    where: {
      userId: params.userId,
      createdAt: { gte: utcDayStart(now) }
    }
  });

  // Next reset = tomorrow at 00:00 UTC.
  const resetAt = new Date(utcDayStart(now));
  resetAt.setUTCDate(resetAt.getUTCDate() + 1);

  return {
    used,
    limit,
    allowed: used < limit,
    resetsAtIso: resetAt.toISOString()
  };
}

/**
 * Throwing version. Use right before invoking the vision API. We
 * keep the throw to a plain Error with a structured property so the
 * caller (tRPC mutation) can convert to a TRPCError with the
 * appropriate code + message rather than leaking quota internals to
 * other paths.
 */
export class OcrQuotaExceededError extends Error {
  readonly resetsAtIso: string;
  readonly used: number;
  readonly limit: number;
  constructor(status: QuotaStatus) {
    super(`OCR daily quota exceeded (${status.used}/${status.limit})`);
    this.name = "OcrQuotaExceededError";
    this.resetsAtIso = status.resetsAtIso;
    this.used = status.used;
    this.limit = status.limit;
  }
}

export async function requireOcrQuota(params: {
  prisma: PrismaClient;
  userId: string;
  now?: Date;
}): Promise<QuotaStatus> {
  const status = await getOcrQuotaStatus(params);
  if (!status.allowed) {
    throw new OcrQuotaExceededError(status);
  }
  return status;
}

/**
 * Record a completed OCR call (success or failure). Fire-and-forget
 * is fine — we don't want a logging failure to break the user's
 * request. Caller should NOT await this in the hot path.
 *
 * `topConfidence` for multi-step calls is the highest confidence
 * among the returned steps (`high > medium > low > none`); when no
 * steps came back it's `"none"`.
 */
export async function recordOcrCall(params: {
  prisma: PrismaClient;
  userId: string;
  kind: "single_step" | "multi_step";
  succeeded: boolean;
  stepCount?: number | null;
  topConfidence?: "high" | "medium" | "low" | "none" | null;
  problemAttemptId?: string | null;
}): Promise<void> {
  try {
    const ocrCallLog = (params.prisma as unknown as {
      ocrCallLog: {
        create: (args: unknown) => Promise<unknown>;
      };
    }).ocrCallLog;
    await ocrCallLog.create({
      data: {
        userId: params.userId,
        kind: params.kind,
        succeeded: params.succeeded,
        stepCount: params.stepCount ?? null,
        topConfidence: params.topConfidence ?? null,
        problemAttemptId: params.problemAttemptId ?? null
      }
    });
  } catch (err) {
    // Don't propagate — the user got their OCR result, we just lost
    // a telemetry row. Log so it's visible during pilot.
    console.warn("[ocr-quota] recordOcrCall failed (silently)", err);
  }
}

/** Derive the max confidence from a single OCR result for logging. */
export function pickTopConfidenceSingle(
  result: HandwritingOcrResult | null
): "high" | "medium" | "low" | "none" | null {
  if (!result) return null;
  return result.confidence;
}

/** Derive the max confidence across a multi-step OCR result. */
export function pickTopConfidenceMulti(
  result: HandwritingMultiStepOcrResult | null
): "high" | "medium" | "low" | "none" | null {
  if (!result) return null;
  if (result.steps.length === 0) return "none";
  // Order: high > medium > low > none. Walk once and pick the best.
  const rank = { high: 4, medium: 3, low: 2, none: 1 } as const;
  let best: keyof typeof rank = "none";
  for (const s of result.steps) {
    if (rank[s.confidence] > rank[best]) best = s.confidence;
  }
  return best;
}
