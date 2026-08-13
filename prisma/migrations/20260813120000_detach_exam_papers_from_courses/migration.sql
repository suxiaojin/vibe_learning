CREATE TYPE "QuestionBankOwnerType" AS ENUM ('public_subject', 'major');

ALTER TABLE "exam_papers"
ADD COLUMN "regionId" TEXT,
ADD COLUMN "ownerType" "QuestionBankOwnerType",
ADD COLUMN "publicSubjectId" TEXT,
ADD COLUMN "majorId" TEXT,
ADD COLUMN "questionTypeConfig" JSONB;

UPDATE "exam_papers" AS paper
SET "regionId" = course."regionId",
    "ownerType" = course."courseType"::text::"QuestionBankOwnerType",
    "publicSubjectId" = course."publicSubjectId",
    "majorId" = course."majorId",
    "questionTypeConfig" = course."questionTypeConfig"
FROM "learning_courses" AS course
WHERE paper."courseId" = course."id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "exam_papers"
    WHERE "regionId" IS NULL
       OR "ownerType" IS NULL
       OR ("ownerType" = 'major' AND ("majorId" IS NULL OR "publicSubjectId" IS NOT NULL))
       OR ("ownerType" = 'public_subject' AND ("publicSubjectId" IS NULL OR "majorId" IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'Cannot detach exam papers: invalid legacy course ownership data';
  END IF;
END $$;

ALTER TABLE "exam_papers"
ALTER COLUMN "regionId" SET NOT NULL,
ALTER COLUMN "ownerType" SET NOT NULL;

DROP INDEX "exam_papers_courseId_status_sortOrder_idx";
ALTER TABLE "exam_papers" DROP CONSTRAINT "exam_papers_courseId_fkey";
ALTER TABLE "exam_papers" DROP COLUMN "courseId";

ALTER TABLE "exam_papers"
ADD CONSTRAINT "exam_papers_scope_check" CHECK (
  ("ownerType" = 'major' AND "majorId" IS NOT NULL AND "publicSubjectId" IS NULL)
  OR
  ("ownerType" = 'public_subject' AND "publicSubjectId" IS NOT NULL AND "majorId" IS NULL)
);

CREATE INDEX "exam_papers_regionId_ownerType_status_sortOrder_idx"
ON "exam_papers"("regionId", "ownerType", "status", "sortOrder");
CREATE INDEX "exam_papers_publicSubjectId_idx" ON "exam_papers"("publicSubjectId");
CREATE INDEX "exam_papers_majorId_idx" ON "exam_papers"("majorId");

ALTER TABLE "exam_papers"
ADD CONSTRAINT "exam_papers_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "exam_papers_publicSubjectId_fkey" FOREIGN KEY ("publicSubjectId") REFERENCES "public_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "exam_papers_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "majors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "questions" DROP CONSTRAINT "questions_knowledgePointId_fkey";
ALTER TABLE "questions" ALTER COLUMN "knowledgePointId" DROP NOT NULL;
ALTER TABLE "questions"
ADD CONSTRAINT "questions_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "knowledge_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;
