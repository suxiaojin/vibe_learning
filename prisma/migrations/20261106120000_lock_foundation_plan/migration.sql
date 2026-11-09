ALTER TABLE "student_profiles" ADD COLUMN "foundationPlanConfirmedAt" TIMESTAMP(3);

UPDATE "student_profiles"
SET "foundationPlanConfirmedAt" = CURRENT_TIMESTAMP
WHERE "regionId" IS NOT NULL AND "publicSubjectId" IS NOT NULL AND "majorId" IS NOT NULL;
