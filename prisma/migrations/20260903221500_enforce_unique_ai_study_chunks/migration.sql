ALTER TABLE "ai_study_source_chunks"
ALTER COLUMN "pageStart" SET NOT NULL,
ALTER COLUMN "pageEnd" SET NOT NULL,
ALTER COLUMN "chunkType" SET NOT NULL,
ALTER COLUMN "sourceBlockIds" SET NOT NULL,
ALTER COLUMN "tokenCount" SET NOT NULL,
ALTER COLUMN "contentHash" SET NOT NULL;

CREATE UNIQUE INDEX "ai_study_source_chunks_sourceId_chunkType_contentHash_key"
ON "ai_study_source_chunks"("sourceId", "chunkType", "contentHash");
