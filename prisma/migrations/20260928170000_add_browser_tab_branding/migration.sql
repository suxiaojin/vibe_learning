ALTER TABLE "system_settings"
ADD COLUMN "browserTabTitle" TEXT NOT NULL DEFAULT 'Vibe Learning',
ADD COLUMN "browserTabIconData" TEXT NOT NULL DEFAULT '',
ADD COLUMN "browserTabIconUpdatedAt" TIMESTAMP(3);
