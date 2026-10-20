ALTER TABLE "ai_study_card_jobs" DROP CONSTRAINT "ai_study_card_jobs_status_check";
ALTER TABLE "ai_study_card_jobs" ADD CONSTRAINT "ai_study_card_jobs_status_check"
  CHECK ("status" IN ('unrequested','pending','running','succeeded','failed','paused'));
ALTER TABLE "ai_study_card_jobs" ALTER COLUMN "status" SET DEFAULT 'unrequested';

-- Previously queued cards were scheduled automatically. Keep completed and
-- in-flight work, while requiring an explicit click for remaining cards.
UPDATE "ai_study_card_jobs" SET "status" = 'unrequested', "priority" = 0
WHERE "status" = 'pending';
