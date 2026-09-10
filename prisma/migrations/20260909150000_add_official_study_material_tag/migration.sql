BEGIN;

ALTER TABLE "official_study_materials"
ADD COLUMN "tag" VARCHAR(50);

COMMIT;
