CREATE TYPE "LearningChallengePurpose" AS ENUM ('challenge', 'special_practice');

ALTER TABLE "chapter_challenge_versions"
ADD COLUMN "purpose" "LearningChallengePurpose" NOT NULL DEFAULT 'challenge';

DROP INDEX "chapter_challenge_versions_chapterId_version_key";
DROP INDEX "chapter_challenge_versions_chapterId_status_version_idx";

CREATE UNIQUE INDEX "chapter_challenge_versions_chapterId_purpose_version_key"
ON "chapter_challenge_versions"("chapterId", "purpose", "version");

CREATE INDEX "chapter_challenge_versions_chapterId_purpose_status_version_idx"
ON "chapter_challenge_versions"("chapterId", "purpose", "status", "version");
