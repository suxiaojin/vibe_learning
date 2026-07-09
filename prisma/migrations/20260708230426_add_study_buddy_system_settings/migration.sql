ALTER TABLE "system_settings"
  ADD COLUMN "studyBuddyHeroTitle" TEXT NOT NULL DEFAULT '好好学习，早日上岸',
  ADD COLUMN "studyBuddyHeroEffect" TEXT NOT NULL DEFAULT 'typewriter',
  ADD COLUMN "studyBuddyHeroTypeSpeedMs" INTEGER NOT NULL DEFAULT 105;
