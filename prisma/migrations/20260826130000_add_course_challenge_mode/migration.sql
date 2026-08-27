CREATE TYPE "LearningChallengeMode" AS ENUM ('chapter', 'course');

CREATE TYPE "LearningCheckpointScope" AS ENUM ('course');

ALTER TABLE "learning_courses"
ADD COLUMN "challengeMode" "LearningChallengeMode" NOT NULL DEFAULT 'chapter';

ALTER TABLE "syllabus_items"
ADD COLUMN "checkpointScope" "LearningCheckpointScope";

CREATE UNIQUE INDEX "syllabus_items_courseId_checkpointScope_key"
ON "syllabus_items"("courseId", "checkpointScope");
