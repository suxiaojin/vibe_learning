-- Add explicit professional-major/public-subject ownership for official materials.
ALTER TABLE "official_study_materials"
ADD COLUMN "majorId" TEXT,
ADD COLUMN "publicSubjectId" TEXT;

-- Preserve any existing selection by mapping its legacy learning course owner.
UPDATE "official_study_materials" AS material
SET "majorId" = course."majorId",
    "publicSubjectId" = course."publicSubjectId"
FROM "learning_courses" AS course
WHERE material."courseId" = course."id";

ALTER TABLE "official_study_materials"
ADD CONSTRAINT "official_study_materials_scope_check"
CHECK (NOT ("majorId" IS NOT NULL AND "publicSubjectId" IS NOT NULL));

CREATE INDEX "official_study_materials_majorId_idx"
ON "official_study_materials"("majorId");

CREATE INDEX "official_study_materials_publicSubjectId_idx"
ON "official_study_materials"("publicSubjectId");

ALTER TABLE "official_study_materials"
ADD CONSTRAINT "official_study_materials_majorId_fkey"
FOREIGN KEY ("majorId") REFERENCES "majors"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "official_study_materials"
ADD CONSTRAINT "official_study_materials_publicSubjectId_fkey"
FOREIGN KEY ("publicSubjectId") REFERENCES "public_subjects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
