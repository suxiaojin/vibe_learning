CREATE TYPE "QuizSessionStatus" AS ENUM ('in_progress', 'completed');

CREATE TABLE "quiz_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "syllabusItemId" TEXT NOT NULL,
  "status" "QuizSessionStatus" NOT NULL DEFAULT 'in_progress',
  "currentIndex" INTEGER NOT NULL DEFAULT 0,
  "score" INTEGER,
  "correctCount" INTEGER NOT NULL DEFAULT 0,
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "diamondRewardAmount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "quiz_sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "question_attempts"
  ADD COLUMN "sessionId" TEXT;

CREATE INDEX "quiz_sessions_userId_syllabusItemId_status_updatedAt_idx"
  ON "quiz_sessions"("userId", "syllabusItemId", "status", "updatedAt");

CREATE INDEX "quiz_sessions_syllabusItemId_idx"
  ON "quiz_sessions"("syllabusItemId");

CREATE INDEX "question_attempts_sessionId_questionId_idx"
  ON "question_attempts"("sessionId", "questionId");

ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_syllabusItemId_fkey"
  FOREIGN KEY ("syllabusItemId") REFERENCES "syllabus_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "quiz_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
