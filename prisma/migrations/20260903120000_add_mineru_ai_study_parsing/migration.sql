-- This test environment has no real users. Remove every existing AI learning
-- project and its purchase-row reference before switching the parser. Diamond
-- transaction rows are intentionally retained, so charging/refund semantics do
-- not change.
DELETE FROM "study_project_purchases" WHERE "kind" = 'ai';
DELETE FROM "ai_study_projects";

ALTER TABLE "ai_study_sources"
ADD COLUMN "parserVersion" TEXT,
ADD COLUMN "parseBackend" TEXT,
ADD COLUMN "sourceSha256" TEXT,
ADD COLUMN "parseManifestKey" TEXT,
ADD COLUMN "parseContentListKey" TEXT,
ADD COLUMN "parseMarkdownKey" TEXT,
ADD COLUMN "parsedPageCount" INTEGER,
ADD COLUMN "failedPageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "parseWarnings" JSONB;

ALTER TABLE "ai_study_source_chunks"
ADD COLUMN "pageStart" INTEGER,
ADD COLUMN "pageEnd" INTEGER,
ADD COLUMN "chunkType" TEXT,
ADD COLUMN "sourceBlockIds" JSONB,
ADD COLUMN "headingPath" JSONB,
ADD COLUMN "tokenCount" INTEGER,
ADD COLUMN "contentHash" TEXT;

CREATE TABLE "ai_study_source_blocks" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "pageNumber" INTEGER NOT NULL,
  "blockIndex" INTEGER NOT NULL,
  "blockType" TEXT NOT NULL,
  "readingOrder" INTEGER NOT NULL,
  "bbox" JSONB,
  "textContent" TEXT,
  "latexContent" TEXT,
  "structuredContent" JSONB,
  "assetKey" TEXT,
  "headingPath" JSONB,
  "confidence" DOUBLE PRECISION,
  "parserBlockId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_study_source_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_study_source_blocks_sourceId_blockIndex_key"
ON "ai_study_source_blocks"("sourceId", "blockIndex");

CREATE INDEX "ai_study_source_blocks_projectId_sourceId_pageNumber_readingOrder_idx"
ON "ai_study_source_blocks"("projectId", "sourceId", "pageNumber", "readingOrder");

CREATE INDEX "ai_study_source_blocks_sourceId_blockType_idx"
ON "ai_study_source_blocks"("sourceId", "blockType");

ALTER TABLE "ai_study_source_blocks"
ADD CONSTRAINT "ai_study_source_blocks_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "ai_study_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_study_source_blocks"
ADD CONSTRAINT "ai_study_source_blocks_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "ai_study_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
