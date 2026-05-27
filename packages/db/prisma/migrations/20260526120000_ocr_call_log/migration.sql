-- 2026-05-26: Handwriting OCR call log (Sprint 2).
--
-- One row per call to GPT-4o vision, regardless of success. Two
-- purposes packaged into one table because they share the same
-- data:
--
--   1. Per-user daily quota — counting rows where userId = ? AND
--      createdAt >= today's UTC midnight gives us the budget check.
--      Default ceiling lives in code (OCR_DAILY_QUOTA env var,
--      defaults to 50) so we can dial it without a migration.
--
--   2. Lightweight telemetry — Sprint 3 will build an effectiveness
--      dashboard ("how often does HIGH-confidence OCR match the
--      final saved step?"). The data is already here.
--
-- We intentionally do NOT store the image bytes or the OCR'd LaTeX
-- itself. Image privacy concerns + payload size both make
-- persistence costly; if we later want replay we'll promote to an
-- S3-backed storage key.

CREATE TABLE "OcrCallLog" (
    "id"               TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- "single_step" → Sprint 1 single-step OCR call.
    -- "multi_step"  → Sprint 2 batch call that returns N steps.
    "kind"             TEXT NOT NULL,
    -- Number of steps the model emitted (1 for single, 0..N for
    -- batch). NULL if the call failed before parsing a response.
    "stepCount"        INTEGER,
    -- Max confidence among returned steps. Stringly-typed
    -- ("high"/"medium"/"low"/"none") so we can add new buckets
    -- without another migration.
    "topConfidence"    TEXT,
    -- True if the call returned without API/parse error
    -- (regardless of confidence). False = network/4xx/parse fail.
    "succeeded"        BOOLEAN NOT NULL DEFAULT true,
    -- Optional foreign key into the attempt the student was on.
    -- Nullable because OCR might happen before/outside an attempt
    -- context (e.g. in a future "scratchpad" mode).
    "problemAttemptId" TEXT,

    CONSTRAINT "OcrCallLog_pkey" PRIMARY KEY ("id")
);

-- Quota lookup: count rows where userId = ? AND createdAt >= today.
CREATE INDEX "OcrCallLog_userId_createdAt_idx"
    ON "OcrCallLog" ("userId", "createdAt");

-- Cross-user analytics (e.g. "vision API outage at 03:00 UTC —
-- which failed calls correlate?") needs a createdAt index for
-- range scans across all users.
CREATE INDEX "OcrCallLog_createdAt_idx" ON "OcrCallLog" ("createdAt");

ALTER TABLE "OcrCallLog"
    ADD CONSTRAINT "OcrCallLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
