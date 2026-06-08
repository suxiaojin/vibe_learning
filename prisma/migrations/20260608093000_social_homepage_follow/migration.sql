ALTER TABLE "student_profiles"
  ADD COLUMN "coverImage" TEXT,
  ADD COLUMN "bio" TEXT;

CREATE TABLE "social_follows" (
  "id" TEXT NOT NULL,
  "followerId" TEXT NOT NULL,
  "followingId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "social_follows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_follows_followerId_followingId_key" ON "social_follows"("followerId", "followingId");
CREATE INDEX "social_follows_followerId_createdAt_idx" ON "social_follows"("followerId", "createdAt");
CREATE INDEX "social_follows_followingId_createdAt_idx" ON "social_follows"("followingId", "createdAt");

ALTER TABLE "social_follows"
  ADD CONSTRAINT "social_follows_distinct_users_check"
  CHECK ("followerId" <> "followingId");

ALTER TABLE "social_follows"
  ADD CONSTRAINT "social_follows_followerId_fkey"
  FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_follows"
  ADD CONSTRAINT "social_follows_followingId_fkey"
  FOREIGN KEY ("followingId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
