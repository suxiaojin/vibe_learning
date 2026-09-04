CREATE TABLE "ai_study_prompt_profiles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_study_prompt_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_study_prompt_versions" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "templates" JSONB NOT NULL,
    "changeNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_study_prompt_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_study_projects" ADD COLUMN "aiPromptVersionId" TEXT;
ALTER TABLE "ai_study_cards" ADD COLUMN "aiPromptVersionId" TEXT;
ALTER TABLE "ai_study_chat_messages" ADD COLUMN "ai_prompt_version_id" TEXT;

CREATE UNIQUE INDEX "ai_study_prompt_profiles_key_key" ON "ai_study_prompt_profiles"("key");
CREATE UNIQUE INDEX "ai_study_prompt_profiles_activeVersionId_key" ON "ai_study_prompt_profiles"("activeVersionId");
CREATE UNIQUE INDEX "ai_study_prompt_versions_profileId_version_key" ON "ai_study_prompt_versions"("profileId", "version");
CREATE INDEX "ai_study_prompt_versions_profileId_publishedAt_version_idx" ON "ai_study_prompt_versions"("profileId", "publishedAt", "version");
CREATE INDEX "ai_study_projects_aiPromptVersionId_idx" ON "ai_study_projects"("aiPromptVersionId");
CREATE INDEX "ai_study_cards_aiPromptVersionId_idx" ON "ai_study_cards"("aiPromptVersionId");
CREATE INDEX "ai_study_chat_messages_prompt_version_idx" ON "ai_study_chat_messages"("ai_prompt_version_id");

ALTER TABLE "ai_study_prompt_versions"
    ADD CONSTRAINT "ai_study_prompt_versions_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "ai_study_prompt_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_study_prompt_profiles"
    ADD CONSTRAINT "ai_study_prompt_profiles_activeVersionId_fkey"
    FOREIGN KEY ("activeVersionId") REFERENCES "ai_study_prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_study_projects"
    ADD CONSTRAINT "ai_study_projects_aiPromptVersionId_fkey"
    FOREIGN KEY ("aiPromptVersionId") REFERENCES "ai_study_prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_study_cards"
    ADD CONSTRAINT "ai_study_cards_aiPromptVersionId_fkey"
    FOREIGN KEY ("aiPromptVersionId") REFERENCES "ai_study_prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_study_chat_messages"
    ADD CONSTRAINT "ai_study_chat_messages_ai_prompt_version_id_fkey"
    FOREIGN KEY ("ai_prompt_version_id") REFERENCES "ai_study_prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
