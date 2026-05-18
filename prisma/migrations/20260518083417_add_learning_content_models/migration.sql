-- CreateEnum
CREATE TYPE "LearningCourseType" AS ENUM ('public_subject', 'major');

-- CreateEnum
CREATE TYPE "SyllabusRequirement" AS ENUM ('know', 'understand', 'master', 'apply');

-- CreateEnum
CREATE TYPE "PaperType" AS ENUM ('real_exam', 'mock_exam', 'practice_set');

-- CreateEnum
CREATE TYPE "QuestionSourceType" AS ENUM ('manual', 'real_exam', 'outline', 'import');

-- AlterTable
ALTER TABLE "chapters" ADD COLUMN     "courseId" TEXT;

-- AlterTable
ALTER TABLE "knowledge_points" ADD COLUMN     "syllabusItemId" TEXT;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "sourceType" "QuestionSourceType" NOT NULL DEFAULT 'manual',
ADD COLUMN     "sourceYear" INTEGER,
ADD COLUMN     "syllabusItemId" TEXT;

-- CreateTable
CREATE TABLE "learning_courses" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "publicSubjectId" TEXT,
    "majorId" TEXT,
    "name" TEXT NOT NULL,
    "courseType" "LearningCourseType" NOT NULL,
    "description" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_items" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requirement" "SyllabusRequirement",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syllabus_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_papers" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "paperType" "PaperType" NOT NULL DEFAULT 'real_exam',
    "description" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_paper_questions" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_paper_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_courses_regionId_courseType_status_sortOrder_idx" ON "learning_courses"("regionId", "courseType", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "learning_courses_publicSubjectId_idx" ON "learning_courses"("publicSubjectId");

-- CreateIndex
CREATE INDEX "learning_courses_majorId_idx" ON "learning_courses"("majorId");

-- CreateIndex
CREATE INDEX "syllabus_items_courseId_parentId_sortOrder_idx" ON "syllabus_items"("courseId", "parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "syllabus_items_status_sortOrder_idx" ON "syllabus_items"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "exam_papers_courseId_status_sortOrder_idx" ON "exam_papers"("courseId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "exam_papers_year_paperType_idx" ON "exam_papers"("year", "paperType");

-- CreateIndex
CREATE INDEX "exam_paper_questions_paperId_sortOrder_idx" ON "exam_paper_questions"("paperId", "sortOrder");

-- CreateIndex
CREATE INDEX "exam_paper_questions_questionId_idx" ON "exam_paper_questions"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_paper_questions_paperId_questionId_key" ON "exam_paper_questions"("paperId", "questionId");

-- CreateIndex
CREATE INDEX "chapters_courseId_sortOrder_idx" ON "chapters"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "knowledge_points_syllabusItemId_idx" ON "knowledge_points"("syllabusItemId");

-- CreateIndex
CREATE INDEX "questions_syllabusItemId_idx" ON "questions"("syllabusItemId");

-- CreateIndex
CREATE INDEX "questions_sourceType_sourceYear_idx" ON "questions"("sourceType", "sourceYear");

-- AddForeignKey
ALTER TABLE "learning_courses" ADD CONSTRAINT "learning_courses_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_courses" ADD CONSTRAINT "learning_courses_publicSubjectId_fkey" FOREIGN KEY ("publicSubjectId") REFERENCES "public_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_courses" ADD CONSTRAINT "learning_courses_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "majors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_items" ADD CONSTRAINT "syllabus_items_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "learning_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_items" ADD CONSTRAINT "syllabus_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "syllabus_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "learning_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_points" ADD CONSTRAINT "knowledge_points_syllabusItemId_fkey" FOREIGN KEY ("syllabusItemId") REFERENCES "syllabus_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_syllabusItemId_fkey" FOREIGN KEY ("syllabusItemId") REFERENCES "syllabus_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "learning_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_questions" ADD CONSTRAINT "exam_paper_questions_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_questions" ADD CONSTRAINT "exam_paper_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
