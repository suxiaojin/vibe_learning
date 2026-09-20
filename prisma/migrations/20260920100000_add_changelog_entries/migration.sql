CREATE TABLE "changelog_entries" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "releaseDate" DATE,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "changelog_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "changelog_entries_isPublished_releaseDate_createdAt_id_idx"
ON "changelog_entries"("isPublished", "releaseDate", "createdAt", "id");

-- Preserve the complete existing content, without inventing a release date.
-- The old settings field is retained as a backup, but no longer edited or read by the UI.
INSERT INTO "changelog_entries" ("id", "title", "content", "isPublished", "updatedAt")
SELECT 'legacy-changelog', '历史更新日志', "changelogContent", true, CURRENT_TIMESTAMP
FROM "system_settings"
WHERE "id" = 'default' AND "changelogContent" ~ '[^[:space:]]';
