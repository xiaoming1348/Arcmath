-- 2026-05-23: Student progress snapshots (Phase B of the personalized
-- report rebuild).
--
-- Stores periodic (weekly) aggregations of each student's lifetime
-- learning metrics, so /me/progress can show trends over time
-- ("accuracy went from 58% → 72% over the last 8 weeks") and
-- week-over-week deltas ("you did 12 more problems this week and
-- improved accuracy by +4 pp on geometry topics").
--
-- Snapshots are written on-demand by the /me/progress page when the
-- last snapshot for that user is missing or > 6 days old, so we don't
-- need a cron. The aggregation logic lives in TS
-- (apps/web/src/lib/ai/student-progress-report.ts) and is independent
-- of the schema.
--
-- The JSON blobs (topicBreakdown, difficultyBreakdown, reportJson)
-- carry the structured snapshot so we can replay any week's view
-- without re-querying the underlying attempts table — fast on
-- /me/progress's trend chart.

CREATE TABLE "StudentProgressSnapshot" (
    "id"                  TEXT NOT NULL,
    "userId"              TEXT NOT NULL,
    "snapshotAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- The 7-day window this snapshot is anchored to. Both inclusive of
    -- start, exclusive of end (standard half-open interval).
    "windowStart"         TIMESTAMP(3) NOT NULL,
    "windowEnd"           TIMESTAMP(3) NOT NULL,

    -- Denormalized headline metrics for fast list / trend rendering.
    -- All cumulative-to-windowEnd (NOT just within the window). The
    -- delta module computes "this week vs last" by subtracting
    -- consecutive snapshots' cumulative numbers.
    "totalAttempts"       INTEGER NOT NULL DEFAULT 0,
    "totalCorrect"        INTEGER NOT NULL DEFAULT 0,
    "accuracy"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeSpentSeconds"    INTEGER NOT NULL DEFAULT 0,
    "hintsUsed"           INTEGER NOT NULL DEFAULT 0,

    -- Structured breakdowns. Each is an array of { key, attempts,
    -- correct, accuracy, ... }. Capped to top ~20 entries when written.
    "topicBreakdown"      JSONB NOT NULL DEFAULT '[]'::jsonb,
    "difficultyBreakdown" JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Optional: full ProgressAggregation object so we can re-render
    -- the entire /me/progress as-of-this-week. Lets us show a
    -- "Replay last month's report" mode later.
    "reportJson"          JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT "StudentProgressSnapshot_pkey" PRIMARY KEY ("id")
);

-- Lookups are by user (lifetime trend) and by user + window end
-- (for "is the current week's snapshot missing or stale?").
CREATE INDEX "StudentProgressSnapshot_userId_snapshotAt_idx"
    ON "StudentProgressSnapshot" ("userId", "snapshotAt");
CREATE INDEX "StudentProgressSnapshot_userId_windowEnd_idx"
    ON "StudentProgressSnapshot" ("userId", "windowEnd");

-- A user has at most ONE snapshot per (userId, windowStart) pair.
-- This is the dedup key — if the page loads twice in the same week,
-- the second call upserts the same row.
CREATE UNIQUE INDEX "StudentProgressSnapshot_userId_windowStart_key"
    ON "StudentProgressSnapshot" ("userId", "windowStart");

ALTER TABLE "StudentProgressSnapshot"
    ADD CONSTRAINT "StudentProgressSnapshot_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
