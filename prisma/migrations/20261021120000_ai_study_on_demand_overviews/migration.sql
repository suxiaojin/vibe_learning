CREATE TABLE "ai_study_overview_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nodeId" TEXT NOT NULL UNIQUE REFERENCES "ai_study_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "projectId" TEXT NOT NULL REFERENCES "ai_study_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_study_overview_jobs_status_check" CHECK ("status" IN ('pending','running','succeeded','failed'))
);

CREATE INDEX "ai_study_overview_jobs_status_nextAttemptAt_idx" ON "ai_study_overview_jobs"("status", "nextAttemptAt");
CREATE INDEX "ai_study_overview_jobs_projectId_status_idx" ON "ai_study_overview_jobs"("projectId", "status");
