CREATE INDEX "buddy_posts_originalPostId_deletedAt_createdAt_idx"
ON "buddy_posts"("originalPostId", "deletedAt", "createdAt");

CREATE INDEX "buddy_post_likes_postId_active_createdAt_idx"
ON "buddy_post_likes"("postId", "active", "createdAt");
