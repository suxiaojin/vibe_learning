-- CreateEnum
CREATE TYPE "OfficialStudyMaterialFileType" AS ENUM ('pdf', 'word');

-- CreateEnum
CREATE TYPE "OfficialStudyMaterialFileStatus" AS ENUM ('uploading', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "OfficialStudyMaterialVisibility" AS ENUM ('draft', 'public', 'offline');

-- CreateTable
CREATE TABLE "official_study_materials" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileType" "OfficialStudyMaterialFileType" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "storageBucket" TEXT,
    "storageKey" TEXT,
    "storagePath" TEXT,
    "previewText" TEXT,
    "previewTruncated" BOOLEAN NOT NULL DEFAULT false,
    "fileStatus" "OfficialStudyMaterialFileStatus" NOT NULL DEFAULT 'uploading',
    "processingError" TEXT,
    "visibility" "OfficialStudyMaterialVisibility" NOT NULL DEFAULT 'draft',
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_study_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "official_study_materials_visibility_fileStatus_sortOrder_pu_idx" ON "official_study_materials"("visibility", "fileStatus", "sortOrder", "publishedAt");

-- CreateIndex
CREATE INDEX "official_study_materials_createdById_deletedAt_createdAt_idx" ON "official_study_materials"("createdById", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "official_study_materials_courseId_idx" ON "official_study_materials"("courseId");

-- CreateIndex
CREATE INDEX "official_study_materials_storageBucket_storageKey_idx" ON "official_study_materials"("storageBucket", "storageKey");

-- AddForeignKey
ALTER TABLE "official_study_materials" ADD CONSTRAINT "official_study_materials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_study_materials" ADD CONSTRAINT "official_study_materials_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "learning_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
