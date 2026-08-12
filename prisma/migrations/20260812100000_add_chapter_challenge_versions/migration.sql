CREATE TABLE "chapter_challenge_versions" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "targetQuestionCount" INTEGER NOT NULL DEFAULT 10,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapter_challenge_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chapter_challenge_questions" (
    "id" TEXT NOT NULL,
    "challengeVersionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_challenge_questions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quiz_sessions" ADD COLUMN "chapterChallengeVersionId" TEXT;

CREATE UNIQUE INDEX "chapter_challenge_versions_chapterId_version_key"
    ON "chapter_challenge_versions"("chapterId", "version");
CREATE INDEX "chapter_challenge_versions_chapterId_status_version_idx"
    ON "chapter_challenge_versions"("chapterId", "status", "version");
CREATE UNIQUE INDEX "chapter_challenge_questions_challengeVersionId_questionId_key"
    ON "chapter_challenge_questions"("challengeVersionId", "questionId");
CREATE INDEX "chapter_challenge_questions_challengeVersionId_sortOrder_idx"
    ON "chapter_challenge_questions"("challengeVersionId", "sortOrder");
CREATE INDEX "chapter_challenge_questions_questionId_idx"
    ON "chapter_challenge_questions"("questionId");
CREATE INDEX "quiz_sessions_chapterChallengeVersionId_idx"
    ON "quiz_sessions"("chapterChallengeVersionId");

ALTER TABLE "chapter_challenge_versions"
    ADD CONSTRAINT "chapter_challenge_versions_chapterId_fkey"
    FOREIGN KEY ("chapterId") REFERENCES "syllabus_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapter_challenge_questions"
    ADD CONSTRAINT "chapter_challenge_questions_challengeVersionId_fkey"
    FOREIGN KEY ("challengeVersionId") REFERENCES "chapter_challenge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapter_challenge_questions"
    ADD CONSTRAINT "chapter_challenge_questions_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quiz_sessions"
    ADD CONSTRAINT "quiz_sessions_chapterChallengeVersionId_fkey"
    FOREIGN KEY ("chapterChallengeVersionId") REFERENCES "chapter_challenge_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
