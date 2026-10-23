ALTER TABLE "ai_study_chat_messages"
  ADD COLUMN "regeneration_of_id" TEXT,
  ADD COLUMN "question_message_id" TEXT;

ALTER TABLE "ai_study_chat_messages"
  ADD CONSTRAINT "ai_study_chat_messages_regeneration_of_id_fkey"
  FOREIGN KEY ("regeneration_of_id") REFERENCES "ai_study_chat_messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ai_study_chat_messages_regeneration_created_idx"
  ON "ai_study_chat_messages"("regeneration_of_id", "created_at");

ALTER TABLE "ai_study_chat_messages"
  ADD CONSTRAINT "ai_study_chat_messages_question_message_id_fkey"
  FOREIGN KEY ("question_message_id") REFERENCES "ai_study_chat_messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ai_study_chat_messages_question_idx"
  ON "ai_study_chat_messages"("question_message_id");
