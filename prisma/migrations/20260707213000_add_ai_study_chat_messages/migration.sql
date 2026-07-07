CREATE TABLE "ai_study_chat_messages" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "node_id" TEXT,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_study_chat_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_study_chat_messages_role_check" CHECK ("role" IN ('assistant', 'user')),
  CONSTRAINT "ai_study_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_study_chat_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "ai_study_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_study_chat_messages_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "ai_study_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ai_study_chat_messages_user_project_node_created_idx"
  ON "ai_study_chat_messages"("user_id", "project_id", "node_id", "created_at");

CREATE INDEX "ai_study_chat_messages_project_created_idx"
  ON "ai_study_chat_messages"("project_id", "created_at");
