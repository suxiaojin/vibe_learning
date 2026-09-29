ALTER TABLE "system_settings"
ADD COLUMN "homepageContent" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE "homepage_images" (
    "slot" TEXT NOT NULL,
    "body" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'image/webp',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homepage_images_pkey" PRIMARY KEY ("slot")
);
