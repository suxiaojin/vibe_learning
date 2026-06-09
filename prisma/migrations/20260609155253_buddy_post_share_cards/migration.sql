CREATE TYPE "BuddyPostShareType" AS ENUM ('question_card', 'quiz_result_card', 'active_learning_card');

ALTER TABLE "buddy_posts"
  ADD COLUMN "shareType" "BuddyPostShareType",
  ADD COLUMN "sharePayload" JSONB;

CREATE INDEX "buddy_posts_shareType_createdAt_idx" ON "buddy_posts"("shareType", "createdAt");
