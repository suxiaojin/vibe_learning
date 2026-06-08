CREATE TABLE "social_blocks" (
  "id" TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "social_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_blocks_blockerId_blockedId_key" ON "social_blocks"("blockerId", "blockedId");
CREATE INDEX "social_blocks_blockerId_createdAt_idx" ON "social_blocks"("blockerId", "createdAt");
CREATE INDEX "social_blocks_blockedId_createdAt_idx" ON "social_blocks"("blockedId", "createdAt");

ALTER TABLE "social_blocks"
  ADD CONSTRAINT "social_blocks_distinct_users_check"
  CHECK ("blockerId" <> "blockedId");

ALTER TABLE "social_blocks"
  ADD CONSTRAINT "social_blocks_blockerId_fkey"
  FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_blocks"
  ADD CONSTRAINT "social_blocks_blockedId_fkey"
  FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "buddy_posts"
  DROP CONSTRAINT IF EXISTS "buddy_posts_shape_check";

ALTER TABLE "buddy_posts"
  ADD CONSTRAINT "buddy_posts_shape_check"
  CHECK (
    (
      "type" = 'original'
      AND "originalPostId" IS NULL
      AND "content" IS NOT NULL
      AND length(btrim("content")) >= 1
    )
    OR (
      "type" = 'repost'
      AND "originalPostId" IS NOT NULL
      AND (
        "content" IS NULL
        OR length(btrim("content")) >= 1
      )
    )
  );
