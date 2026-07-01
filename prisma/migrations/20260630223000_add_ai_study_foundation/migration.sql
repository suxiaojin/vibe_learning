-- CreateEnum
CREATE TYPE "AiStudySourceType" AS ENUM ('pdf', 'document', 'image', 'text', 'mixed');

-- CreateEnum
CREATE TYPE "AiStudyLearningGoal" AS ENUM ('preview', 'review', 'sprint', 'weak_point', 'other');

-- CreateEnum
CREATE TYPE "AiStudyVisibility" AS ENUM ('private', 'public_pending', 'public', 'rejected');

-- CreateEnum
CREATE TYPE "AiStudyProjectStatus" AS ENUM ('draft', 'processing', 'ready', 'failed', 'archived');

-- CreateEnum
CREATE TYPE "AiStudySourceStatus" AS ENUM ('uploaded', 'parsed', 'failed');

-- CreateEnum
CREATE TYPE "AiStudyNodeStatus" AS ENUM ('draft', 'ready', 'hidden');

-- CreateEnum
CREATE TYPE "AiStudyCardReviewStatus" AS ENUM ('unreviewed', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "AiStudyProgressStatus" AS ENUM ('not_started', 'learning', 'review_needed', 'mastered');

-- CreateEnum
CREATE TYPE "AiStudyTaskType" AS ENUM ('parse_source', 'generate_outline', 'generate_cards', 'generate_quiz', 'quality_check');

-- CreateEnum
CREATE TYPE "AiStudyTaskStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'canceled');

-- CreateTable
CREATE TABLE "ai_study_projects" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceType" "AiStudySourceType" NOT NULL,
    "learningGoal" "AiStudyLearningGoal" NOT NULL,
    "courseId" TEXT,
    "visibility" "AiStudyVisibility" NOT NULL DEFAULT 'private',
    "status" "AiStudyProjectStatus" NOT NULL DEFAULT 'draft',
    "knowledgeCount" INTEGER NOT NULL DEFAULT 0,
    "masteredCount" INTEGER NOT NULL DEFAULT 0,
    "lastStudiedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_study_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_study_sources" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceType" "AiStudySourceType" NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "storageBucket" TEXT,
    "storageKey" TEXT,
    "storagePath" TEXT,
    "textContent" TEXT,
    "pageCount" INTEGER,
    "status" "AiStudySourceStatus" NOT NULL DEFAULT 'uploaded',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_study_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_study_source_chunks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "bbox" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_study_source_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_study_nodes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "sourceChunkIds" JSONB NOT NULL,
    "status" "AiStudyNodeStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_study_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_study_cards" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "overview" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "keyPoints" JSONB NOT NULL,
    "pitfalls" JSONB NOT NULL,
    "examples" JSONB NOT NULL,
    "flashcards" JSONB NOT NULL,
    "modelName" TEXT,
    "promptVersion" TEXT,
    "reviewStatus" "AiStudyCardReviewStatus" NOT NULL DEFAULT 'unreviewed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_study_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_study_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "status" "AiStudyProgressStatus" NOT NULL DEFAULT 'not_started',
    "lastStudiedAt" TIMESTAMP(3),
    "masteredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_study_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_study_generation_tasks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceId" TEXT,
    "type" "AiStudyTaskType" NOT NULL,
    "status" "AiStudyTaskStatus" NOT NULL DEFAULT 'pending',
    "stage" TEXT,
    "inputSummary" JSONB,
    "outputSummary" JSONB,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_study_generation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_study_projects_ownerId_status_updatedAt_idx" ON "ai_study_projects"("ownerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ai_study_projects_ownerId_deletedAt_createdAt_idx" ON "ai_study_projects"("ownerId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ai_study_projects_courseId_idx" ON "ai_study_projects"("courseId");

-- CreateIndex
CREATE INDEX "ai_study_projects_visibility_status_updatedAt_idx" ON "ai_study_projects"("visibility", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ai_study_sources_projectId_status_createdAt_idx" ON "ai_study_sources"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_study_sources_storageBucket_storageKey_idx" ON "ai_study_sources"("storageBucket", "storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "ai_study_source_chunks_sourceId_chunkIndex_key" ON "ai_study_source_chunks"("sourceId", "chunkIndex");

-- CreateIndex
CREATE INDEX "ai_study_source_chunks_projectId_sourceId_idx" ON "ai_study_source_chunks"("projectId", "sourceId");

-- CreateIndex
CREATE INDEX "ai_study_nodes_projectId_parentId_sortOrder_idx" ON "ai_study_nodes"("projectId", "parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "ai_study_nodes_projectId_status_idx" ON "ai_study_nodes"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_study_cards_nodeId_key" ON "ai_study_cards"("nodeId");

-- CreateIndex
CREATE INDEX "ai_study_cards_projectId_reviewStatus_idx" ON "ai_study_cards"("projectId", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ai_study_progress_userId_nodeId_key" ON "ai_study_progress"("userId", "nodeId");

-- CreateIndex
CREATE INDEX "ai_study_progress_projectId_status_idx" ON "ai_study_progress"("projectId", "status");

-- CreateIndex
CREATE INDEX "ai_study_progress_userId_projectId_idx" ON "ai_study_progress"("userId", "projectId");

-- CreateIndex
CREATE INDEX "ai_study_generation_tasks_status_type_createdAt_idx" ON "ai_study_generation_tasks"("status", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ai_study_generation_tasks_projectId_status_createdAt_idx" ON "ai_study_generation_tasks"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_study_generation_tasks_sourceId_idx" ON "ai_study_generation_tasks"("sourceId");

-- AddForeignKey
ALTER TABLE "ai_study_projects" ADD CONSTRAINT "ai_study_projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_projects" ADD CONSTRAINT "ai_study_projects_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "learning_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_sources" ADD CONSTRAINT "ai_study_sources_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ai_study_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_source_chunks" ADD CONSTRAINT "ai_study_source_chunks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ai_study_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_source_chunks" ADD CONSTRAINT "ai_study_source_chunks_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ai_study_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_nodes" ADD CONSTRAINT "ai_study_nodes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ai_study_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_nodes" ADD CONSTRAINT "ai_study_nodes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ai_study_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_cards" ADD CONSTRAINT "ai_study_cards_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ai_study_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_cards" ADD CONSTRAINT "ai_study_cards_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "ai_study_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_progress" ADD CONSTRAINT "ai_study_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_progress" ADD CONSTRAINT "ai_study_progress_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ai_study_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_progress" ADD CONSTRAINT "ai_study_progress_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "ai_study_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_generation_tasks" ADD CONSTRAINT "ai_study_generation_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ai_study_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_study_generation_tasks" ADD CONSTRAINT "ai_study_generation_tasks_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ai_study_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
