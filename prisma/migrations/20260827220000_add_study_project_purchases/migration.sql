BEGIN;

ALTER TYPE "DiamondTransactionType" ADD VALUE 'project_purchase';
CREATE TYPE "StudyProjectKind" AS ENUM ('ai', 'official');

CREATE TABLE "study_project_purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "StudyProjectKind" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "aiProjectId" TEXT,
    "officialMaterialId" TEXT,
    "titleSnapshot" TEXT NOT NULL,
    "diamondPrice" INTEGER NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "study_project_purchases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "study_project_purchases_positive_price" CHECK ("diamondPrice" > 0),
    CONSTRAINT "study_project_purchases_resource_kind" CHECK (
        ("kind" = 'ai' AND "officialMaterialId" IS NULL AND ("aiProjectId" IS NULL OR "aiProjectId" = "resourceId")) OR
        ("kind" = 'official' AND "aiProjectId" IS NULL AND ("officialMaterialId" IS NULL OR "officialMaterialId" = "resourceId"))
    )
);

CREATE UNIQUE INDEX "study_project_purchases_transactionId_key" ON "study_project_purchases"("transactionId");
CREATE UNIQUE INDEX "study_project_purchases_userId_kind_resourceId_key" ON "study_project_purchases"("userId", "kind", "resourceId");
CREATE INDEX "study_project_purchases_aiProjectId_userId_idx" ON "study_project_purchases"("aiProjectId", "userId");
CREATE INDEX "study_project_purchases_officialMaterialId_userId_idx" ON "study_project_purchases"("officialMaterialId", "userId");

ALTER TABLE "study_project_purchases" ADD CONSTRAINT "study_project_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_project_purchases" ADD CONSTRAINT "study_project_purchases_aiProjectId_fkey" FOREIGN KEY ("aiProjectId") REFERENCES "ai_study_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "study_project_purchases" ADD CONSTRAINT "study_project_purchases_officialMaterialId_fkey" FOREIGN KEY ("officialMaterialId") REFERENCES "official_study_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "study_project_purchases" ADD CONSTRAINT "study_project_purchases_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "diamond_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
