-- Prices are display-only in this phase; existing and new projects default to free.
BEGIN;

ALTER TABLE "ai_study_projects"
ADD COLUMN "diamondPrice" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "ai_study_projects_diamondPrice_nonnegative" CHECK ("diamondPrice" >= 0);

ALTER TABLE "official_study_materials"
ADD COLUMN "diamondPrice" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "official_study_materials_diamondPrice_nonnegative" CHECK ("diamondPrice" >= 0);

COMMIT;
