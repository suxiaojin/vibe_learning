CREATE TYPE "StudentGender" AS ENUM ('male', 'female');

CREATE TYPE "DiamondTransactionType" AS ENUM (
  'register_bonus',
  'daily_active_bonus',
  'daily_answer_bonus',
  'purchase',
  'admin_adjust',
  'ai_consumption'
);

ALTER TABLE "student_profiles"
  ADD COLUMN "nickname" TEXT,
  ADD COLUMN "avatarColor" TEXT NOT NULL DEFAULT 'green',
  ADD COLUMN "gender" "StudentGender",
  ADD COLUMN "school" TEXT;

CREATE TABLE "diamond_accounts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "diamond_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diamond_transactions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "type" "DiamondTransactionType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "occurredOn" DATE NOT NULL,
  "dedupeKey" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "diamond_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "diamond_accounts_userId_key" ON "diamond_accounts"("userId");
CREATE UNIQUE INDEX "diamond_transactions_dedupeKey_key" ON "diamond_transactions"("dedupeKey");
CREATE INDEX "diamond_transactions_userId_createdAt_idx" ON "diamond_transactions"("userId", "createdAt");
CREATE INDEX "diamond_transactions_accountId_createdAt_idx" ON "diamond_transactions"("accountId", "createdAt");
CREATE INDEX "diamond_transactions_type_occurredOn_idx" ON "diamond_transactions"("type", "occurredOn");

ALTER TABLE "diamond_accounts" ADD CONSTRAINT "diamond_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "diamond_transactions" ADD CONSTRAINT "diamond_transactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "diamond_transactions" ADD CONSTRAINT "diamond_transactions_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "diamond_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
