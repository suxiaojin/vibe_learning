-- MinerU's complete JSON and Markdown remain in MinIO. PostgreSQL keeps only
-- normalized source blocks and lightweight semantic chunk references.
ALTER TABLE "ai_study_sources"
DROP COLUMN "textContent";

ALTER TABLE "ai_study_source_blocks"
DROP COLUMN "structuredContent",
DROP COLUMN "headingPath";

ALTER TABLE "ai_study_source_chunks"
DROP COLUMN "pageNumber",
DROP COLUMN "content",
DROP COLUMN "bbox",
DROP COLUMN "headingPath";
