ALTER TABLE "changelog_entries"
ADD COLUMN "badgeText" TEXT NOT NULL DEFAULT '';

-- Preserve the current visible "最新" hint as editable data.
-- It is written once; after this migration, the UI never derives a badge from list position.
UPDATE "changelog_entries"
SET "badgeText" = '最新'
WHERE "id" = (
  SELECT "id"
  FROM "changelog_entries"
  WHERE "isPublished" = true
  ORDER BY "releaseDate" DESC NULLS LAST, "createdAt" DESC, "id" DESC
  LIMIT 1
);
