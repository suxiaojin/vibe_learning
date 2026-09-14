BEGIN;

ALTER TABLE "ai_server_settings"
    ADD COLUMN "customServers" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "moduleRoutes" JSONB NOT NULL DEFAULT '{}';

COMMIT;
