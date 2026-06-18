ALTER TABLE "questions"
  ADD COLUMN "aiDoubtAnswer" TEXT;

ALTER TABLE "ai_conversations"
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'general';

CREATE INDEX "ai_conversations_userId_questionId_purpose_idx"
  ON "ai_conversations"("userId", "questionId", "purpose");

CREATE INDEX "ai_conversations_questionId_purpose_idx"
  ON "ai_conversations"("questionId", "purpose");
