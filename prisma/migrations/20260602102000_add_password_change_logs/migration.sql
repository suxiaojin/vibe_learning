CREATE TYPE "PasswordChangeSource" AS ENUM ('student_self', 'admin_reset');

CREATE TABLE "password_change_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "source" "PasswordChangeSource" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_change_logs_userId_createdAt_idx" ON "password_change_logs"("userId", "createdAt");
CREATE INDEX "password_change_logs_actorUserId_createdAt_idx" ON "password_change_logs"("actorUserId", "createdAt");

ALTER TABLE "password_change_logs"
  ADD CONSTRAINT "password_change_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "password_change_logs"
  ADD CONSTRAINT "password_change_logs_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
