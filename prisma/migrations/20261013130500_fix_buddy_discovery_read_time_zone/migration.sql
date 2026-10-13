WITH migration_window AS (
  SELECT
    started_at AT TIME ZONE 'Asia/Shanghai' AS local_started_at,
    finished_at AT TIME ZONE 'Asia/Shanghai' AS local_finished_at,
    (started_at AT TIME ZONE 'Asia/Shanghai')
      - (started_at AT TIME ZONE 'UTC') AS timezone_offset
  FROM _prisma_migrations
  WHERE migration_name = '20261013120000_add_buddy_discovery_feed_read_state'
    AND finished_at IS NOT NULL
)
UPDATE buddy_feed_read_states AS read_state
SET "discoveryReadAt" = read_state."discoveryReadAt" - migration_window.timezone_offset
FROM migration_window
WHERE read_state."discoveryReadAt" >= migration_window.local_started_at
  AND read_state."discoveryReadAt" <= migration_window.local_finished_at;

UPDATE buddy_feed_read_states AS read_state
SET "discoveryReadAt" = read_state."discoveryReadAt"
  - ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
    - (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
WHERE read_state."discoveryReadAt" = read_state."createdAt"
  AND read_state."discoveryReadAt" > read_state."followingReadAt";

ALTER TABLE buddy_feed_read_states
ALTER COLUMN "discoveryReadAt" DROP DEFAULT;
