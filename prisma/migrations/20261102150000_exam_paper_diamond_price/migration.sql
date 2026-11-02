ALTER TABLE "exam_papers" ADD COLUMN "diamondPrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_diamondPrice_nonnegative" CHECK ("diamondPrice" >= 0);
