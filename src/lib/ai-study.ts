import { randomUUID } from "crypto";
import { z } from "zod";
import type { AiStudyProgressStatus, AiStudyTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uploadAiStudyObject } from "@/lib/ai-study-storage";

const sourceTypeSchema = z.enum(["pdf", "document", "image", "text", "mixed"]);
const learningGoalSchema = z.enum(["preview", "review", "sprint", "weak_point", "other"]);
const projectStatusSchema = z.enum(["draft", "processing", "ready", "failed", "archived"]);
const progressStatusSchema = z.enum(["not_started", "learning", "review_needed", "mastered"]);

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().nullable(),
  sourceType: sourceTypeSchema.default("text"),
  learningGoal: learningGoalSchema.default("review"),
  courseId: z.string().trim().min(1).optional().nullable(),
  textContent: z.string().trim().min(1).max(200_000).optional().nullable()
});

const listProjectsSchema = z.object({
  status: projectStatusSchema.optional().nullable()
});

const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(35)
});

const updateProgressSchema = z.object({
  status: progressStatusSchema
});

type UploadedSourceInput = {
  fileName: string;
  mimeType: string;
  size: number;
  body: Buffer;
};

export class AiStudyError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "AI_STUDY_ERROR") {
    super(message);
    this.name = "AiStudyError";
  }
}

export function formatAiStudyError(error: unknown) {
  if (error instanceof AiStudyError) {
    return { message: error.message, status: error.status, code: error.code };
  }
  return null;
}

export async function listAiStudyProjects(ownerId: string, input: unknown = {}) {
  const parsed = parseAiStudyInput(listProjectsSchema, input, "项目筛选参数不合法。");
  return prisma.aiStudyProject.findMany({
    where: {
      ownerId,
      deletedAt: null,
      ...(parsed.status ? { status: parsed.status } : {})
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      tasks: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          status: true,
          stage: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true
        }
      },
      _count: {
        select: {
          sources: true,
          nodes: true,
          tasks: true
        }
      }
    }
  });
}

export async function listPublicAiStudyProjects(input: { take?: number } = {}) {
  return prisma.aiStudyProject.findMany({
    where: {
      visibility: "public",
      deletedAt: null
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.max(1, Math.min(input.take || 12, 24)),
    include: {
      owner: {
        select: {
          username: true,
          studentProfile: {
            select: {
              nickname: true
            }
          }
        }
      },
      _count: {
        select: {
          sources: true,
          nodes: true,
          tasks: true
        }
      }
    }
  });
}

export async function createAiStudyProject(ownerId: string, input: unknown) {
  const parsed = parseAiStudyInput(createProjectSchema, input, "学习项目参数不合法。");
  await assertProjectCreateLimit(ownerId);
  await assertCourseExists(parsed.courseId || null);

  const textContent = parsed.textContent?.trim() || "";
  const sourceType = parsed.sourceType ?? "text";
  const learningGoal = parsed.learningGoal ?? "review";
  const status = textContent ? "processing" : "draft";

  return prisma.$transaction(async (tx) => {
    const project = await tx.aiStudyProject.create({
      data: {
        ownerId,
        title: parsed.title,
        description: parsed.description || null,
        sourceType: textContent ? "text" : sourceType,
        learningGoal,
        courseId: parsed.courseId || null,
        status
      }
    });

    if (!textContent) {
      return project;
    }

    const source = await tx.aiStudySource.create({
      data: {
        projectId: project.id,
        sourceType: "text",
        fileName: null,
        mimeType: "text/plain",
        fileSizeBytes: Buffer.byteLength(textContent, "utf8"),
        textContent,
        status: "parsed"
      }
    });

    const chunks = buildAiStudyTextChunks(textContent).map((content, chunkIndex) => ({
      projectId: project.id,
      sourceId: source.id,
      chunkIndex,
      content
    }));

    if (chunks.length > 0) {
      await tx.aiStudySourceChunk.createMany({ data: chunks });
    }

    await tx.aiStudyGenerationTask.create({
      data: {
        projectId: project.id,
        sourceId: source.id,
        type: "generate_outline",
        stage: "waiting_for_ai_generation",
        inputSummary: {
          sourceType: "text",
          chunkCount: chunks.length,
          textLength: textContent.length
        }
      }
    });

    return project;
  });
}

export async function getAiStudyProject(ownerId: string, projectId: string) {
  const project = await prisma.aiStudyProject.findFirst({
    where: {
      id: projectId,
      ownerId,
      deletedAt: null
    },
    include: {
      sources: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          sourceType: true,
          fileName: true,
          mimeType: true,
          fileSizeBytes: true,
          storageBucket: true,
          storageKey: true,
          storagePath: true,
          pageCount: true,
          status: true,
          createdAt: true
        }
      },
      tasks: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          sourceId: true,
          type: true,
          status: true,
          stage: true,
          errorMessage: true,
          retryCount: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          updatedAt: true
        }
      },
      _count: {
        select: {
          sourceChunks: true,
          nodes: true,
          cards: true
        }
      }
    }
  });

  if (!project) {
    throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
  }

  return project;
}

export async function softDeleteAiStudyProject(ownerId: string, projectId: string) {
  const result = await prisma.aiStudyProject.updateMany({
    where: {
      id: projectId,
      ownerId,
      deletedAt: null
    },
    data: {
      status: "archived",
      deletedAt: new Date()
    }
  });

  if (result.count === 0) {
    throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
  }

  return { deleted: true };
}

export async function updateAiStudyProject(ownerId: string, projectId: string, input: unknown) {
  const parsed = parseAiStudyInput(updateProjectSchema, input, "学习项目参数不合法。");
  const result = await prisma.aiStudyProject.updateMany({
    where: {
      id: projectId,
      ownerId,
      deletedAt: null
    },
    data: {
      title: parsed.title
    }
  });

  if (result.count === 0) {
    throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
  }

  return getAiStudyProject(ownerId, projectId);
}

export async function uploadAiStudySource(ownerId: string, projectId: string, input: UploadedSourceInput) {
  const project = await assertOwnedProject(ownerId, projectId);
  const maxFileBytes = getMaxFileBytes();
  if (input.size <= 0) {
    throw new AiStudyError("上传文件不能为空。", 400, "AI_STUDY_EMPTY_FILE");
  }
  if (input.size > maxFileBytes) {
    throw new AiStudyError(`上传文件不能超过 ${Math.floor(maxFileBytes / 1024 / 1024)}MB。`, 413, "AI_STUDY_FILE_TOO_LARGE");
  }
  if (!isPdfFile(input.fileName, input.mimeType)) {
    throw new AiStudyError("当前阶段仅支持上传 PDF 文件。", 400, "AI_STUDY_UNSUPPORTED_FILE_TYPE");
  }

  const sourceId = randomUUID();
  const safeFileName = sanitizeFileName(input.fileName) || "source.pdf";
  const storageKey = `ai-study/${ownerId}/${project.id}/${sourceId}/${safeFileName}`;
  const uploaded = await uploadAiStudyObject({
    key: storageKey,
    body: input.body,
    contentType: input.mimeType || "application/pdf"
  });

  return prisma.$transaction(async (tx) => {
    const source = await tx.aiStudySource.create({
      data: {
        id: sourceId,
        projectId: project.id,
        sourceType: "pdf",
        fileName: input.fileName,
        mimeType: input.mimeType || "application/pdf",
        fileSizeBytes: input.size,
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key,
        storagePath: uploaded.storagePath,
        status: "uploaded"
      }
    });

    const task = await tx.aiStudyGenerationTask.create({
      data: {
        projectId: project.id,
        sourceId: source.id,
        type: "parse_source",
        stage: "waiting_for_pdf_parse",
        inputSummary: {
          fileName: input.fileName,
          mimeType: input.mimeType || "application/pdf",
          fileSizeBytes: input.size,
          storagePath: uploaded.storagePath
        }
      }
    });

    await tx.aiStudyProject.update({
      where: { id: project.id },
      data: {
        sourceType: project.sourceType === "text" ? "mixed" : "pdf",
        status: "processing"
      }
    });

    return { source, task };
  });
}

export async function listAiStudyProjectTasks(ownerId: string, projectId: string) {
  await assertOwnedProject(ownerId, projectId);
  return prisma.aiStudyGenerationTask.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      projectId: true,
      sourceId: true,
      type: true,
      status: true,
      stage: true,
      inputSummary: true,
      outputSummary: true,
      errorMessage: true,
      retryCount: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export async function listAiStudyProjectNodes(ownerId: string, projectId: string) {
  await assertOwnedProject(ownerId, projectId);
  return prisma.aiStudyNode.findMany({
    where: {
      projectId,
      project: {
        ownerId,
        deletedAt: null
      }
    },
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      parentId: true,
      title: true,
      summary: true,
      sortOrder: true,
      depth: true,
      sourceChunkIds: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      cards: {
        select: {
          id: true,
          reviewStatus: true,
          updatedAt: true
        }
      },
      progress: {
        where: { userId: ownerId },
        select: {
          status: true,
          lastStudiedAt: true,
          masteredAt: true,
          updatedAt: true
        }
      }
    }
  });
}

export async function getAiStudyNodeDetail(ownerId: string, nodeId: string) {
  const node = await prisma.aiStudyNode.findFirst({
    where: {
      id: nodeId,
      project: {
        ownerId,
        deletedAt: null
      }
    },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          status: true,
          knowledgeCount: true,
          masteredCount: true
        }
      },
      cards: {
        take: 1,
        select: {
          id: true,
          overview: true,
          explanation: true,
          keyPoints: true,
          pitfalls: true,
          examples: true,
          flashcards: true,
          modelName: true,
          promptVersion: true,
          reviewStatus: true,
          createdAt: true,
          updatedAt: true
        }
      },
      progress: {
        where: { userId: ownerId },
        take: 1,
        select: {
          status: true,
          lastStudiedAt: true,
          masteredAt: true,
          updatedAt: true
        }
      }
    }
  });

  if (!node) {
    throw new AiStudyError("知识节点不存在。", 404, "AI_STUDY_NODE_NOT_FOUND");
  }

  const sourceChunkIds = Array.isArray(node.sourceChunkIds) ? node.sourceChunkIds.filter((value): value is string => typeof value === "string") : [];
  const sourceChunks = sourceChunkIds.length
    ? await prisma.aiStudySourceChunk.findMany({
        where: { id: { in: sourceChunkIds } },
        orderBy: [{ sourceId: "asc" }, { chunkIndex: "asc" }],
        select: {
          id: true,
          sourceId: true,
          pageNumber: true,
          chunkIndex: true,
          content: true,
          bbox: true,
          createdAt: true
        }
      })
    : [];

  const { cards, progress, ...nodeDetail } = node;
  return {
    ...nodeDetail,
    card: cards[0] || null,
    progress: progress[0] || null,
    sourceChunks
  };
}

export async function updateAiStudyNodeProgress(ownerId: string, nodeId: string, input: unknown) {
  const parsed = parseAiStudyInput(updateProgressSchema, input, "掌握状态参数不合法。");
  const node = await prisma.aiStudyNode.findFirst({
    where: {
      id: nodeId,
      project: {
        ownerId,
        deletedAt: null
      }
    },
    select: {
      id: true,
      projectId: true
    }
  });

  if (!node) {
    throw new AiStudyError("知识节点不存在。", 404, "AI_STUDY_NODE_NOT_FOUND");
  }

  const now = new Date();
  const progress = await prisma.$transaction(async (tx) => {
    const saved = await tx.aiStudyProgress.upsert({
      where: {
        userId_nodeId: {
          userId: ownerId,
          nodeId: node.id
        }
      },
      create: {
        userId: ownerId,
        projectId: node.projectId,
        nodeId: node.id,
        status: parsed.status,
        lastStudiedAt: now,
        masteredAt: parsed.status === "mastered" ? now : null
      },
      update: {
        status: parsed.status,
        lastStudiedAt: now,
        masteredAt: parsed.status === "mastered" ? now : null
      }
    });

    const masteredCount = await tx.aiStudyProgress.count({
      where: {
        projectId: node.projectId,
        status: "mastered"
      }
    });

    await tx.aiStudyProject.update({
      where: { id: node.projectId },
      data: {
        masteredCount,
        lastStudiedAt: now
      }
    });

    return saved;
  });

  return progress;
}

export async function markAiStudyTaskRunning(taskId: string, stage: string) {
  return updateAiStudyTaskStatus(taskId, "running", {
    stage,
    startedAt: new Date(),
    finishedAt: null,
    errorMessage: null
  });
}

export async function markAiStudyTaskSucceeded(taskId: string, outputSummary: Record<string, unknown> = {}) {
  return updateAiStudyTaskStatus(taskId, "succeeded", {
    outputSummary,
    finishedAt: new Date(),
    errorMessage: null
  });
}

export async function markAiStudyTaskFailed(taskId: string, errorMessage: string, stage?: string) {
  return updateAiStudyTaskStatus(taskId, "failed", {
    ...(stage ? { stage } : {}),
    errorMessage: errorMessage.slice(0, 4000),
    finishedAt: new Date()
  });
}

async function updateAiStudyTaskStatus(taskId: string, status: AiStudyTaskStatus, data: Record<string, unknown>) {
  return prisma.aiStudyGenerationTask.update({
    where: { id: taskId },
    data: {
      ...data,
      status
    } as never
  });
}

function parseAiStudyInput<T>(schema: z.ZodType<T>, input: unknown, message: string) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AiStudyError(message, 400, "AI_STUDY_INVALID_INPUT");
  }
  return parsed.data;
}

async function assertProjectCreateLimit(ownerId: string) {
  const maxProjectsPerDay = getNumberEnv("AI_STUDY_MAX_PROJECTS_PER_DAY", 3);
  if (maxProjectsPerDay <= 0) {
    return;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.aiStudyProject.count({
    where: {
      ownerId,
      createdAt: { gte: since }
    }
  });

  if (count >= maxProjectsPerDay) {
    throw new AiStudyError("今天创建的学习项目已达上限，请明天再试。", 429, "AI_STUDY_PROJECT_LIMIT_REACHED");
  }
}

async function assertCourseExists(courseId: string | null) {
  if (!courseId) {
    return;
  }
  const course = await prisma.learningCourse.findUnique({
    where: { id: courseId },
    select: { id: true }
  });
  if (!course) {
    throw new AiStudyError("关联课程不存在。", 400, "AI_STUDY_COURSE_NOT_FOUND");
  }
}

async function assertOwnedProject(ownerId: string, projectId: string) {
  const project = await prisma.aiStudyProject.findFirst({
    where: {
      id: projectId,
      ownerId,
      deletedAt: null
    },
    select: {
      id: true,
      sourceType: true
    }
  });

  if (!project) {
    throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
  }

  return project;
}

export function buildAiStudyTextChunks(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) {
    return [];
  }

  const maxChunkLength = 1200;
  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChunkLength) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let index = 0; index < paragraph.length; index += maxChunkLength) {
        chunks.push(paragraph.slice(index, index + maxChunkLength));
      }
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChunkLength) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function isPdfFile(fileName: string, mimeType: string) {
  return mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

function sanitizeFileName(fileName: string) {
  const fallback = fileName.split(/[\\/]/).pop() || "source.pdf";
  const safe = fallback
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe.slice(0, 120);
}

function getMaxFileBytes() {
  return getNumberEnv("AI_STUDY_MAX_FILE_MB", 20) * 1024 * 1024;
}

function getNumberEnv(name: string, defaultValue: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : defaultValue;
}
