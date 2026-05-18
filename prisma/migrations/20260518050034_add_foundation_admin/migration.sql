-- CreateEnum
CREATE TYPE "RegionStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "studySystem" TEXT NOT NULL,
    "description" TEXT,
    "status" "RegionStatus" NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "majors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "majors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_public_subjects" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "publicSubjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_public_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_majors" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "majorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_majors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "regionId" TEXT,
    "publicSubjectId" TEXT,
    "majorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");

-- CreateIndex
CREATE INDEX "regions_province_studySystem_idx" ON "regions"("province", "studySystem");

-- CreateIndex
CREATE INDEX "regions_status_sortOrder_idx" ON "regions"("status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "public_subjects_name_key" ON "public_subjects"("name");

-- CreateIndex
CREATE UNIQUE INDEX "public_subjects_code_key" ON "public_subjects"("code");

-- CreateIndex
CREATE INDEX "public_subjects_status_sortOrder_idx" ON "public_subjects"("status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "majors_name_key" ON "majors"("name");

-- CreateIndex
CREATE INDEX "majors_status_sortOrder_idx" ON "majors"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "region_public_subjects_regionId_idx" ON "region_public_subjects"("regionId");

-- CreateIndex
CREATE INDEX "region_public_subjects_publicSubjectId_idx" ON "region_public_subjects"("publicSubjectId");

-- CreateIndex
CREATE UNIQUE INDEX "region_public_subjects_regionId_publicSubjectId_key" ON "region_public_subjects"("regionId", "publicSubjectId");

-- CreateIndex
CREATE INDEX "region_majors_regionId_idx" ON "region_majors"("regionId");

-- CreateIndex
CREATE INDEX "region_majors_majorId_idx" ON "region_majors"("majorId");

-- CreateIndex
CREATE UNIQUE INDEX "region_majors_regionId_majorId_key" ON "region_majors"("regionId", "majorId");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_userId_key" ON "student_profiles"("userId");

-- CreateIndex
CREATE INDEX "student_profiles_regionId_idx" ON "student_profiles"("regionId");

-- CreateIndex
CREATE INDEX "student_profiles_publicSubjectId_idx" ON "student_profiles"("publicSubjectId");

-- CreateIndex
CREATE INDEX "student_profiles_majorId_idx" ON "student_profiles"("majorId");

-- AddForeignKey
ALTER TABLE "region_public_subjects" ADD CONSTRAINT "region_public_subjects_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region_public_subjects" ADD CONSTRAINT "region_public_subjects_publicSubjectId_fkey" FOREIGN KEY ("publicSubjectId") REFERENCES "public_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region_majors" ADD CONSTRAINT "region_majors_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region_majors" ADD CONSTRAINT "region_majors_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "majors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_publicSubjectId_fkey" FOREIGN KEY ("publicSubjectId") REFERENCES "public_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "majors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
