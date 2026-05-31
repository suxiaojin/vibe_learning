CREATE TABLE "user_syllabus_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syllabusItemId" TEXT NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'locked',
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "passedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_syllabus_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_syllabus_progress_userId_syllabusItemId_key" ON "user_syllabus_progress"("userId", "syllabusItemId");
CREATE INDEX "user_syllabus_progress_syllabusItemId_idx" ON "user_syllabus_progress"("syllabusItemId");

ALTER TABLE "user_syllabus_progress" ADD CONSTRAINT "user_syllabus_progress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_syllabus_progress" ADD CONSTRAINT "user_syllabus_progress_syllabusItemId_fkey"
FOREIGN KEY ("syllabusItemId") REFERENCES "syllabus_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
