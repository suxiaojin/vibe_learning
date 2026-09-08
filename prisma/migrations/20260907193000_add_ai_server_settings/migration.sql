BEGIN;

CREATE TABLE "ai_server_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "mode" TEXT NOT NULL DEFAULT 'built_in',
    "customName" TEXT NOT NULL DEFAULT '',
    "customBaseUrl" TEXT NOT NULL DEFAULT '',
    "customModel" TEXT NOT NULL DEFAULT '',
    "customApiKeyEncrypted" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_server_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_server_settings_mode_check" CHECK ("mode" IN ('built_in', 'custom'))
);

COMMIT;
