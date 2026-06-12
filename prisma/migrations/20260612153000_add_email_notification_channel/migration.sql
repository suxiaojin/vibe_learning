-- Extend notification dispatching so the same templates and jobs can target email.
ALTER TYPE "NotificationDispatchType" ADD VALUE 'immediate';

CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

ALTER TABLE "notification_dispatch_jobs"
  ADD COLUMN "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app';

ALTER TABLE "notification_dispatch_recipients"
  ADD COLUMN "emailSnapshot" TEXT,
  ADD COLUMN "deliveryStatus" "NotificationDeliveryStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryLastError" TEXT;

ALTER TABLE "notification_automation_rules"
  ADD COLUMN "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app';

DROP INDEX "notification_automation_rules_eventType_enabled_idx";

CREATE INDEX "notification_automation_rules_channel_eventType_enabled_idx"
  ON "notification_automation_rules"("channel", "eventType", "enabled");

CREATE INDEX "notification_dispatch_jobs_channel_status_scheduledAt_idx"
  ON "notification_dispatch_jobs"("channel", "status", "scheduledAt");
