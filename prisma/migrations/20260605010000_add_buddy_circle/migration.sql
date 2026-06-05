CREATE TYPE "BuddyPairStatus" AS ENUM ('available', 'active', 'rejected', 'removed');
CREATE TYPE "BuddyRequestStatus" AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn', 'expired');
CREATE TYPE "BuddyPostType" AS ENUM ('original', 'repost');
CREATE TYPE "UserEventNotificationType" AS ENUM (
  'buddy_request_received',
  'buddy_request_accepted',
  'buddy_request_rejected',
  'buddy_post_liked',
  'buddy_post_reposted'
);

CREATE TABLE "schools" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "province" TEXT NOT NULL DEFAULT '未设置',
  "status" "ContentStatus" NOT NULL DEFAULT 'published',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "student_profiles"
  ADD COLUMN "schoolId" TEXT,
  ADD COLUMN "birthYear" INTEGER,
  ADD COLUMN "birthMonth" INTEGER,
  ADD COLUMN "allowBuddySearch" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "buddy_pairs" (
  "id" TEXT NOT NULL,
  "userAId" TEXT NOT NULL,
  "userBId" TEXT NOT NULL,
  "status" "BuddyPairStatus" NOT NULL DEFAULT 'available',
  "activeSince" TIMESTAMP(3),
  "terminalAt" TIMESTAMP(3),
  "terminalById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buddy_pairs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buddy_requests" (
  "id" TEXT NOT NULL,
  "pairId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "status" "BuddyRequestStatus" NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "reapplyAllowedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buddy_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buddy_posts" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "type" "BuddyPostType" NOT NULL DEFAULT 'original',
  "content" TEXT,
  "originalPostId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buddy_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buddy_post_likes" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buddy_post_likes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_event_notifications" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "actorNicknameSnapshot" TEXT NOT NULL,
  "type" "UserEventNotificationType" NOT NULL,
  "requestId" TEXT,
  "postId" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_event_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "schools_province_name_key" ON "schools"("province", "name");
CREATE INDEX "schools_status_sortOrder_idx" ON "schools"("status", "sortOrder");

CREATE INDEX "student_profiles_schoolId_idx" ON "student_profiles"("schoolId");
CREATE INDEX "student_profiles_allowBuddySearch_gender_idx" ON "student_profiles"("allowBuddySearch", "gender");
CREATE INDEX "student_profiles_allowBuddySearch_schoolId_idx" ON "student_profiles"("allowBuddySearch", "schoolId");
CREATE INDEX "student_profiles_allowBuddySearch_birthYear_birthMonth_idx" ON "student_profiles"("allowBuddySearch", "birthYear", "birthMonth");

CREATE UNIQUE INDEX "buddy_pairs_userAId_userBId_key" ON "buddy_pairs"("userAId", "userBId");
CREATE INDEX "buddy_pairs_userAId_status_idx" ON "buddy_pairs"("userAId", "status");
CREATE INDEX "buddy_pairs_userBId_status_idx" ON "buddy_pairs"("userBId", "status");
CREATE INDEX "buddy_pairs_status_updatedAt_idx" ON "buddy_pairs"("status", "updatedAt");

CREATE UNIQUE INDEX "buddy_requests_pair_pending_key" ON "buddy_requests"("pairId") WHERE "status" = 'pending';
CREATE INDEX "buddy_requests_recipientId_status_createdAt_idx" ON "buddy_requests"("recipientId", "status", "createdAt");
CREATE INDEX "buddy_requests_requesterId_status_createdAt_idx" ON "buddy_requests"("requesterId", "status", "createdAt");
CREATE INDEX "buddy_requests_status_expiresAt_idx" ON "buddy_requests"("status", "expiresAt");
CREATE INDEX "buddy_requests_pairId_createdAt_idx" ON "buddy_requests"("pairId", "createdAt");

CREATE UNIQUE INDEX "buddy_posts_authorId_originalPostId_key" ON "buddy_posts"("authorId", "originalPostId");
CREATE INDEX "buddy_posts_authorId_deletedAt_createdAt_idx" ON "buddy_posts"("authorId", "deletedAt", "createdAt");
CREATE INDEX "buddy_posts_originalPostId_idx" ON "buddy_posts"("originalPostId");
CREATE INDEX "buddy_posts_deletedAt_createdAt_idx" ON "buddy_posts"("deletedAt", "createdAt");

CREATE UNIQUE INDEX "buddy_post_likes_postId_userId_key" ON "buddy_post_likes"("postId", "userId");
CREATE INDEX "buddy_post_likes_postId_active_idx" ON "buddy_post_likes"("postId", "active");
CREATE INDEX "buddy_post_likes_userId_createdAt_idx" ON "buddy_post_likes"("userId", "createdAt");

CREATE UNIQUE INDEX "user_event_notifications_dedupeKey_key" ON "user_event_notifications"("dedupeKey");
CREATE INDEX "user_event_notifications_recipientId_readAt_createdAt_idx" ON "user_event_notifications"("recipientId", "readAt", "createdAt");
CREATE INDEX "user_event_notifications_requestId_idx" ON "user_event_notifications"("requestId");
CREATE INDEX "user_event_notifications_postId_idx" ON "user_event_notifications"("postId");

ALTER TABLE "student_profiles"
  ADD CONSTRAINT "student_profiles_birth_year_month_check"
  CHECK (
    ("birthYear" IS NULL AND "birthMonth" IS NULL)
    OR (
      "birthYear" IS NOT NULL
      AND "birthYear" >= 1900
      AND "birthMonth" IS NOT NULL
      AND "birthMonth" BETWEEN 1 AND 12
    )
  );

ALTER TABLE "buddy_pairs"
  ADD CONSTRAINT "buddy_pairs_canonical_users_check"
  CHECK ("userAId" < "userBId");

ALTER TABLE "buddy_requests"
  ADD CONSTRAINT "buddy_requests_distinct_users_check"
  CHECK ("requesterId" <> "recipientId");

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
      AND "content" IS NULL
    )
  );

ALTER TABLE "student_profiles"
  ADD CONSTRAINT "student_profiles_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "buddy_pairs"
  ADD CONSTRAINT "buddy_pairs_userAId_fkey"
  FOREIGN KEY ("userAId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buddy_pairs"
  ADD CONSTRAINT "buddy_pairs_userBId_fkey"
  FOREIGN KEY ("userBId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buddy_pairs"
  ADD CONSTRAINT "buddy_pairs_terminalById_fkey"
  FOREIGN KEY ("terminalById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "buddy_requests"
  ADD CONSTRAINT "buddy_requests_pairId_fkey"
  FOREIGN KEY ("pairId") REFERENCES "buddy_pairs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buddy_requests"
  ADD CONSTRAINT "buddy_requests_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buddy_requests"
  ADD CONSTRAINT "buddy_requests_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "buddy_posts"
  ADD CONSTRAINT "buddy_posts_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buddy_posts"
  ADD CONSTRAINT "buddy_posts_originalPostId_fkey"
  FOREIGN KEY ("originalPostId") REFERENCES "buddy_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "buddy_post_likes"
  ADD CONSTRAINT "buddy_post_likes_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "buddy_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buddy_post_likes"
  ADD CONSTRAINT "buddy_post_likes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_event_notifications"
  ADD CONSTRAINT "user_event_notifications_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_event_notifications"
  ADD CONSTRAINT "user_event_notifications_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_event_notifications"
  ADD CONSTRAINT "user_event_notifications_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "buddy_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_event_notifications"
  ADD CONSTRAINT "user_event_notifications_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "buddy_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "schools" ("id", "name", "province", "status", "sortOrder", "createdAt", "updatedAt")
SELECT
  concat('school_', md5(btrim("school"))),
  btrim("school"),
  '未设置',
  'published',
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "student_profiles"
WHERE "school" IS NOT NULL AND btrim("school") <> ''
GROUP BY btrim("school")
ON CONFLICT ("province", "name") DO NOTHING;

UPDATE "student_profiles" AS sp
SET "schoolId" = s."id"
FROM "schools" AS s
WHERE sp."schoolId" IS NULL
  AND sp."school" IS NOT NULL
  AND btrim(sp."school") = s."name"
  AND s."province" = '未设置';
