ALTER TABLE "system_settings"
ADD COLUMN "profileHomepageBackgroundImageUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN "profileHomepageBackgroundUpdatedAt" TIMESTAMP(3);

ALTER TABLE "student_profiles"
ADD COLUMN "coverImageUpdatedAt" TIMESTAMP(3);

UPDATE "student_profiles"
SET "coverImageUpdatedAt" = "updatedAt"
WHERE "coverImage" IS NOT NULL
  AND "coverImage" <> '';
