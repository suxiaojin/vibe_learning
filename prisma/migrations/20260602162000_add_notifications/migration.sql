CREATE TYPE "NotificationStatus" AS ENUM ('draft', 'sent', 'archived');

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contentHtml" TEXT NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'draft',
  "authorId" TEXT,
  "sentAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_recipients" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_status_expiresAt_sentAt_idx" ON "notifications"("status", "expiresAt", "sentAt");
CREATE INDEX "notifications_authorId_createdAt_idx" ON "notifications"("authorId", "createdAt");
CREATE UNIQUE INDEX "notification_recipients_notificationId_userId_key" ON "notification_recipients"("notificationId", "userId");
CREATE INDEX "notification_recipients_userId_readAt_deliveredAt_idx" ON "notification_recipients"("userId", "readAt", "deliveredAt");
CREATE INDEX "notification_recipients_notificationId_idx" ON "notification_recipients"("notificationId");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification_recipients"
  ADD CONSTRAINT "notification_recipients_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_recipients"
  ADD CONSTRAINT "notification_recipients_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
