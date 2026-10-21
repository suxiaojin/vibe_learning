ALTER TABLE "ai_study_projects" ADD COLUMN "canonicalProjectId" TEXT;

CREATE INDEX "ai_study_projects_canonicalProjectId_idx" ON "ai_study_projects"("canonicalProjectId");

ALTER TABLE "ai_study_projects"
ADD CONSTRAINT "ai_study_projects_canonicalProjectId_fkey"
FOREIGN KEY ("canonicalProjectId") REFERENCES "ai_study_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
