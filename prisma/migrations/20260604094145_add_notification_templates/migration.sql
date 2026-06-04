CREATE TABLE "notification_templates" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contentHtml" TEXT NOT NULL,
  "authorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_templates_authorId_updatedAt_idx" ON "notification_templates"("authorId", "updatedAt");
CREATE INDEX "notification_templates_updatedAt_idx" ON "notification_templates"("updatedAt");

ALTER TABLE "notification_templates"
  ADD CONSTRAINT "notification_templates_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Notifications are now retained until an administrator explicitly withdraws them.
UPDATE "notifications" SET "expiresAt" = NULL WHERE "expiresAt" IS NOT NULL;
