BEGIN;
CREATE TABLE "past_exam_purchases" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "resourceId" TEXT NOT NULL,
  "paperId" TEXT REFERENCES "exam_papers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "titleSnapshot" TEXT NOT NULL,
  "diamondPrice" INTEGER NOT NULL CHECK ("diamondPrice" > 0),
  "transactionId" TEXT NOT NULL REFERENCES "diamond_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("paperId" IS NULL OR "paperId" = "resourceId")
);
CREATE UNIQUE INDEX "past_exam_purchases_transactionId_key" ON "past_exam_purchases"("transactionId");
CREATE UNIQUE INDEX "past_exam_purchases_userId_resourceId_key" ON "past_exam_purchases"("userId", "resourceId");
CREATE INDEX "past_exam_purchases_paperId_userId_idx" ON "past_exam_purchases"("paperId", "userId");
COMMIT;
