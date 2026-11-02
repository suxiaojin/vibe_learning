-- Record the region at the time of copying; older papers have no reliable
-- source metadata and are deliberately left unclassified.
ALTER TABLE "exam_papers"
  ADD COLUMN "copiedFromRegionId" TEXT,
  ADD COLUMN "copiedFromRegionName" TEXT,
  ADD COLUMN "isCrossRegionCopy" BOOLEAN NOT NULL DEFAULT false;
