-- Add account status controls for student operations in the admin backend.
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

ALTER TABLE "users"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN "disabledAt" TIMESTAMP(3),
  ADD COLUMN "disabledReason" TEXT;

CREATE INDEX "users_role_status_createdAt_idx" ON "users"("role", "status", "createdAt");
