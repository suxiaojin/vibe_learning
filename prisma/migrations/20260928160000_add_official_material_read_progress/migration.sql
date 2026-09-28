CREATE TABLE "official_study_material_read_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "official_study_material_read_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "official_study_material_read_progress_userId_materialId_key"
ON "official_study_material_read_progress"("userId", "materialId");

ALTER TABLE "official_study_material_read_progress"
ADD CONSTRAINT "official_study_material_read_progress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "official_study_material_read_progress"
ADD CONSTRAINT "official_study_material_read_progress_materialId_fkey"
FOREIGN KEY ("materialId") REFERENCES "official_study_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
