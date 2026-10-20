ALTER TABLE "ai_study_projects"
  ADD COLUMN "partGroupId" TEXT,
  ADD COLUMN "partIndex" INTEGER,
  ADD COLUMN "partCount" INTEGER;

ALTER TABLE "ai_study_sources"
  ADD COLUMN "originalStorageKey" TEXT,
  ADD COLUMN "originalPageStart" INTEGER,
  ADD COLUMN "originalPageEnd" INTEGER;

CREATE INDEX "ai_study_projects_partGroupId_partIndex_idx"
  ON "ai_study_projects"("partGroupId", "partIndex");
