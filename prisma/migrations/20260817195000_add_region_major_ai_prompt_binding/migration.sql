ALTER TABLE "region_majors"
    ADD COLUMN "aiExplainPromptProfileId" TEXT;

CREATE INDEX "region_majors_aiExplainPromptProfileId_idx"
    ON "region_majors"("aiExplainPromptProfileId");

ALTER TABLE "region_majors"
    ADD CONSTRAINT "region_majors_aiExplainPromptProfileId_fkey"
    FOREIGN KEY ("aiExplainPromptProfileId") REFERENCES "ai_explain_prompt_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
