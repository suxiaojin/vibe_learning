ALTER TABLE "ai_study_projects" ADD COLUMN "learningReadyAt" TIMESTAMP(3);
CREATE TABLE "ai_study_card_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nodeId" TEXT NOT NULL UNIQUE REFERENCES "ai_study_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "projectId" TEXT NOT NULL REFERENCES "ai_study_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "outlineTaskId" TEXT NOT NULL,
  "manifestKey" TEXT NOT NULL,
  "protocol" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "errorKind" TEXT,
  "errorMessage" TEXT,
  "qualityFlags" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_study_card_jobs_status_check" CHECK ("status" IN ('pending','running','succeeded','failed','paused'))
);
CREATE INDEX "ai_study_card_jobs_status_priority_nextAttemptAt_idx" ON "ai_study_card_jobs"("status", "priority", "nextAttemptAt");
CREATE INDEX "ai_study_card_jobs_projectId_status_idx" ON "ai_study_card_jobs"("projectId", "status");
