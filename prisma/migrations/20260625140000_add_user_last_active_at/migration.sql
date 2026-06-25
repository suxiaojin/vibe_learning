-- Add a lightweight activity timestamp for dashboard online-user estimates.
ALTER TABLE "users" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

CREATE INDEX "users_role_status_lastActiveAt_idx" ON "users"("role", "status", "lastActiveAt");
