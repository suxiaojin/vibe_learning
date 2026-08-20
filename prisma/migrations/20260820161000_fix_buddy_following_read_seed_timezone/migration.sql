-- The original read-state seed ran while PostgreSQL used Asia/Shanghai, but
-- Prisma treats these TIMESTAMP(3) values as UTC wall-clock values. Identify
-- only the untouched rows created by that migration and normalize them to UTC.
WITH "sourceMigration" AS (
    SELECT
        "finished_at" AT TIME ZONE 'UTC' AS "appliedUtc",
        "finished_at" AT TIME ZONE 'Asia/Shanghai' AS "appliedBeijing"
    FROM "_prisma_migrations"
    WHERE "migration_name" = '20260820143000_add_buddy_following_feed_read_state'
      AND "finished_at" IS NOT NULL
      AND "rolled_back_at" IS NULL
    ORDER BY "finished_at" DESC
    LIMIT 1
)
UPDATE "buddy_feed_read_states" AS state
SET
    "followingReadAt" = state."followingReadAt" - (migration."appliedBeijing" - migration."appliedUtc"),
    "createdAt" = state."createdAt" - (migration."appliedBeijing" - migration."appliedUtc"),
    "updatedAt" = state."updatedAt" - (migration."appliedBeijing" - migration."appliedUtc")
FROM "sourceMigration" AS migration
WHERE migration."appliedBeijing" - migration."appliedUtc" = INTERVAL '8 hours'
  AND state."followingReadAt" = state."createdAt"
  AND state."updatedAt" = state."createdAt"
  AND state."createdAt" >= migration."appliedBeijing" - INTERVAL '1 minute'
  AND state."createdAt" <= migration."appliedBeijing" + INTERVAL '1 minute';
