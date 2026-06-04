CREATE TYPE "NotificationSource" AS ENUM ('manual', 'scheduled', 'automated');
CREATE TYPE "NotificationDispatchType" AS ENUM ('scheduled', 'automated');
CREATE TYPE "NotificationDispatchStatus" AS ENUM ('pending', 'processing', 'sent', 'cancelled', 'failed');
CREATE TYPE "NotificationAutomationEventType" AS ENUM ('user_registered', 'admin_diamond_added', 'diamond_purchase_succeeded');

ALTER TABLE "notifications"
  ADD COLUMN "source" "NotificationSource" NOT NULL DEFAULT 'manual';

CREATE TABLE "notification_automation_rules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "eventType" "NotificationAutomationEventType" NOT NULL,
  "templateId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "delayMinutes" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_automation_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_events" (
  "id" TEXT NOT NULL,
  "type" "NotificationAutomationEventType" NOT NULL,
  "eventKey" TEXT NOT NULL,
  "userId" TEXT,
  "payload" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_dispatch_jobs" (
  "id" TEXT NOT NULL,
  "type" "NotificationDispatchType" NOT NULL,
  "status" "NotificationDispatchStatus" NOT NULL DEFAULT 'pending',
  "templateId" TEXT,
  "automationRuleId" TEXT,
  "eventId" TEXT,
  "authorId" TEXT,
  "notificationId" TEXT,
  "titleSnapshot" TEXT NOT NULL,
  "contentHtmlSnapshot" TEXT NOT NULL,
  "audienceSnapshot" JSONB,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_dispatch_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_dispatch_recipients" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "userId" TEXT,
  "usernameSnapshot" TEXT NOT NULL,
  "provinceSnapshot" TEXT,
  "studySystemSnapshot" TEXT,
  "majorNameSnapshot" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_dispatch_recipients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_automation_rules_eventType_enabled_idx" ON "notification_automation_rules"("eventType", "enabled");
CREATE INDEX "notification_automation_rules_templateId_idx" ON "notification_automation_rules"("templateId");
CREATE INDEX "notification_automation_rules_createdById_idx" ON "notification_automation_rules"("createdById");

CREATE UNIQUE INDEX "notification_events_eventKey_key" ON "notification_events"("eventKey");
CREATE INDEX "notification_events_processedAt_occurredAt_idx" ON "notification_events"("processedAt", "occurredAt");
CREATE INDEX "notification_events_type_occurredAt_idx" ON "notification_events"("type", "occurredAt");
CREATE INDEX "notification_events_userId_idx" ON "notification_events"("userId");

CREATE UNIQUE INDEX "notification_dispatch_jobs_notificationId_key" ON "notification_dispatch_jobs"("notificationId");
CREATE UNIQUE INDEX "notification_dispatch_jobs_automationRuleId_eventId_key" ON "notification_dispatch_jobs"("automationRuleId", "eventId");
CREATE INDEX "notification_dispatch_jobs_status_scheduledAt_idx" ON "notification_dispatch_jobs"("status", "scheduledAt");
CREATE INDEX "notification_dispatch_jobs_type_createdAt_idx" ON "notification_dispatch_jobs"("type", "createdAt");
CREATE INDEX "notification_dispatch_jobs_templateId_idx" ON "notification_dispatch_jobs"("templateId");
CREATE INDEX "notification_dispatch_jobs_automationRuleId_idx" ON "notification_dispatch_jobs"("automationRuleId");
CREATE INDEX "notification_dispatch_jobs_eventId_idx" ON "notification_dispatch_jobs"("eventId");
CREATE INDEX "notification_dispatch_jobs_authorId_idx" ON "notification_dispatch_jobs"("authorId");

CREATE UNIQUE INDEX "notification_dispatch_recipients_jobId_userId_key" ON "notification_dispatch_recipients"("jobId", "userId");
CREATE INDEX "notification_dispatch_recipients_jobId_idx" ON "notification_dispatch_recipients"("jobId");
CREATE INDEX "notification_dispatch_recipients_userId_idx" ON "notification_dispatch_recipients"("userId");

ALTER TABLE "notification_automation_rules"
  ADD CONSTRAINT "notification_automation_rules_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_automation_rules"
  ADD CONSTRAINT "notification_automation_rules_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification_events"
  ADD CONSTRAINT "notification_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification_dispatch_jobs"
  ADD CONSTRAINT "notification_dispatch_jobs_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_dispatch_jobs"
  ADD CONSTRAINT "notification_dispatch_jobs_automationRuleId_fkey"
  FOREIGN KEY ("automationRuleId") REFERENCES "notification_automation_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_dispatch_jobs"
  ADD CONSTRAINT "notification_dispatch_jobs_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "notification_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_dispatch_jobs"
  ADD CONSTRAINT "notification_dispatch_jobs_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_dispatch_jobs"
  ADD CONSTRAINT "notification_dispatch_jobs_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification_dispatch_recipients"
  ADD CONSTRAINT "notification_dispatch_recipients_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "notification_dispatch_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_dispatch_recipients"
  ADD CONSTRAINT "notification_dispatch_recipients_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
