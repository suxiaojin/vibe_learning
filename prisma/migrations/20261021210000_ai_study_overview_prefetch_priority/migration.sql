ALTER TABLE "ai_study_overview_jobs" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "ai_study_overview_jobs_status_nextAttemptAt_idx";
CREATE INDEX "ai_study_overview_jobs_status_priority_nextAttemptAt_idx"
  ON "ai_study_overview_jobs"("status", "priority", "nextAttemptAt");
