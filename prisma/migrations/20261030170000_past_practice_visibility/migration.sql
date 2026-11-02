-- Existing question banks remain unchanged and do not become student practice
-- papers until an administrator explicitly copies them to a target course.
ALTER TABLE "exam_papers" ADD COLUMN "visibleInPastPractice" BOOLEAN NOT NULL DEFAULT false;
