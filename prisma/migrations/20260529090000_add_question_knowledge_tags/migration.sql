CREATE TYPE "QuestionKnowledgeTagSource" AS ENUM ('ai', 'manual');

CREATE TABLE "question_knowledge_tags" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "syllabusItemId" TEXT NOT NULL,
    "source" "QuestionKnowledgeTagSource" NOT NULL DEFAULT 'manual',
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_knowledge_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "question_knowledge_tags_questionId_syllabusItemId_key" ON "question_knowledge_tags"("questionId", "syllabusItemId");
CREATE INDEX "question_knowledge_tags_questionId_idx" ON "question_knowledge_tags"("questionId");
CREATE INDEX "question_knowledge_tags_syllabusItemId_idx" ON "question_knowledge_tags"("syllabusItemId");
CREATE INDEX "question_knowledge_tags_source_idx" ON "question_knowledge_tags"("source");

ALTER TABLE "question_knowledge_tags" ADD CONSTRAINT "question_knowledge_tags_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_knowledge_tags" ADD CONSTRAINT "question_knowledge_tags_syllabusItemId_fkey" FOREIGN KEY ("syllabusItemId") REFERENCES "syllabus_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
